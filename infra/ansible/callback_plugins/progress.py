# Progress-bar output for the clinic play: one live line with a bar, the task
# count, the running task and the elapsed time, instead of a banner per task.
# Only what changed, failed or was unreachable is printed above the bar; a
# failure prints the full default error. -v and above, a non-TTY stdout, or
# ANSIBLE_STDOUT_CALLBACK=default give the stock output back.
from __future__ import annotations

DOCUMENTATION = """
    name: progress
    type: stdout
    short_description: progress bar output
    description:
        - The default callback with a live progress bar in place of task banners.
    extends_documentation_fragment:
      - default_callback
      - result_format_callback
    requirements:
      - set as stdout in configuration
"""

import os
import shutil
import sys
import threading
import time

import yaml

from ansible import constants as C
from ansible.playbook.block import Block
from ansible.plugins.callback.default import CallbackModule as DefaultCallback

SPINNER = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏"


def _host(result):
    return getattr(result, "host", None) or result._host


def _res(result):
    return getattr(result, "result", None) or result._result


def _count_blocks(blocks):
    n = 0
    for b in blocks:
        for t in list(b.block) + list(b.always):
            if isinstance(t, Block):
                n += _count_blocks([t])
            elif t.action not in C._ACTION_META:
                n += 1
    return n


def _count_yaml(items):
    n = 0
    for t in items or []:
        if not isinstance(t, dict):
            continue
        if "block" in t:
            n += _count_yaml(t["block"]) + _count_yaml(t.get("always"))
        elif not any(k in t for k in ("meta", "ansible.builtin.meta")):
            n += 1
    return n


class CallbackModule(DefaultCallback):
    CALLBACK_VERSION = 2.0
    CALLBACK_TYPE = "stdout"
    CALLBACK_NAME = "progress"

    def __init__(self):
        super().__init__()
        self._enabled = sys.stdout.isatty() and self._display.verbosity == 0
        self._color = not C.ANSIBLE_NOCOLOR
        self._lock = threading.RLock()
        self._total = 0
        self._done = 0
        self._label = ""
        self._note = ""
        self._start = time.monotonic()
        self._drawn = False
        self._running = False

        if self._enabled:
            # Anything ansible prints (warnings, errors, the recap) clears the
            # bar first and redraws it after, so the two never interleave.
            orig = self._display.display

            def display(*args, **kwargs):
                with self._lock:
                    self._clear()
                    orig(*args, **kwargs)
                    self._draw()

            self._display.display = display

    # --- drawing ---------------------------------------------------------

    def _c(self, code, text):
        return f"\x1b[{code}m{text}\x1b[0m" if self._color else text

    def _clear(self):
        if self._drawn:
            sys.stdout.write("\r\x1b[2K")
            sys.stdout.flush()
            self._drawn = False

    def _line(self, final=False):
        cols = shutil.get_terminal_size((80, 20)).columns
        total = max(self._total, self._done, 1)
        frac = 1.0 if final else min(max(self._done - 1, 0) / total, 1.0)
        elapsed = int(time.monotonic() - self._start)
        clock = f"{elapsed // 60}:{elapsed % 60:02d}"
        spin = "✔" if final else SPINNER[int(time.monotonic() * 10) % len(SPINNER)]
        count = f"{min(self._done, total)}/{total}"
        width = max(10, min(30, cols // 4))
        full = int(frac * width)
        bar = "█" * full + ("▌" if frac * width - full >= 0.5 else "")
        bar = bar.ljust(width, "░")
        pct = f"{int(frac * 100):3d}%"
        label = "done" if final else self._label + (f"  ({self._note})" if self._note else "")
        fixed = len(spin) + 1 + width + 1 + len(pct) + 1 + len(count) + 1 + len(clock) + 2
        room = cols - fixed - 1
        if len(label) > room:
            label = label[: max(room - 1, 0)] + "…" if room > 1 else ""
        return (
            f"{self._c('36', spin)} {self._c('32', bar)} {pct} "
            f"{self._c('2', count)} {self._c('2', clock)}  {label}"
        )

    def _draw(self, final=False):
        with self._lock:
            if not self._running:
                return
            sys.stdout.write("\r\x1b[2K" + self._line(final))
            sys.stdout.flush()
            self._drawn = True

    def _tick(self):
        while self._running:
            self._draw()
            time.sleep(0.1)

    def _print(self, msg):
        with self._lock:
            self._clear()
            sys.stdout.write(msg + "\n")
            sys.stdout.flush()
            self._draw()

    def _section(self, task):
        path = task.get_path() or ""
        name = os.path.splitext(os.path.basename(path.split(":")[0]))[0]
        return "" if name in ("", "site") else name

    def _set_task(self, task, prefix):
        self._task_type_cache[task._uuid] = prefix
        self._last_task_name = task.get_name().strip()
        section = self._section(task)
        name = self._last_task_name
        if prefix != "TASK":
            name = f"handler: {name}"
        self._label = f"{section} › {name}" if section else name
        self._note = ""

    # --- play ------------------------------------------------------------

    def v2_playbook_on_play_start(self, play):
        if not self._enabled:
            return super().v2_playbook_on_play_start(play)
        self._play = play
        try:
            blocks = [b.filter_tagged_tasks({}) for b in play.compile()]
        except Exception:
            blocks = play.compile()
        self._total += _count_blocks(blocks)
        if play.gather_facts is not False:
            self._total += 1
        self._print(self._c("1", f"▶ {play.get_name().strip()}"))
        if not self._running:
            self._running = True
            self._start = time.monotonic()
            threading.Thread(target=self._tick, daemon=True).start()

    def v2_playbook_on_include(self, included_file):
        if not self._enabled:
            return super().v2_playbook_on_include(included_file)
        try:
            with open(included_file._filename) as f:
                self._total += _count_yaml(yaml.safe_load(f))
        except Exception:
            pass

    def v2_playbook_on_task_start(self, task, is_conditional):
        if not self._enabled:
            return super().v2_playbook_on_task_start(task, is_conditional)
        self._done += 1
        self._set_task(task, "TASK")
        self._draw()

    def v2_playbook_on_handler_task_start(self, task):
        if not self._enabled:
            return super().v2_playbook_on_handler_task_start(task)
        self._set_task(task, "RUNNING HANDLER")
        self._draw()

    # --- results ---------------------------------------------------------

    def _changed(self, result, item=None):
        host = _host(result).get_name()
        what = f"{self._label} ({item})" if item is not None else self._label
        self._print(f"  {self._c('33', '●')} {self._c('2', host)}  {what}")

    def v2_runner_on_ok(self, result):
        if not self._enabled:
            return super().v2_runner_on_ok(result)
        r = _res(result)
        if r.get("changed") and not r.get("results"):
            self._changed(result)

    def v2_runner_item_on_ok(self, result):
        if not self._enabled:
            return super().v2_runner_item_on_ok(result)
        if _res(result).get("changed"):
            self._changed(result, self._get_item_label(_res(result)))

    def v2_runner_on_skipped(self, result):
        if not self._enabled:
            return super().v2_runner_on_skipped(result)

    def v2_runner_item_on_skipped(self, result):
        if not self._enabled:
            return super().v2_runner_item_on_skipped(result)

    def v2_runner_retry(self, result):
        if not self._enabled:
            return super().v2_runner_retry(result)
        r = _res(result)
        self._note = f"retry {r.get('attempts', '?')}/{r.get('retries', '?')}"
        self._draw()

    # --- end -------------------------------------------------------------

    def v2_playbook_on_stats(self, stats):
        if self._enabled and self._running:
            self._done = max(self._total, self._done)
            with self._lock:
                self._draw(final=True)
                sys.stdout.write("\n")
                self._drawn = False
                self._running = False
        super().v2_playbook_on_stats(stats)
