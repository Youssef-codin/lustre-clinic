import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { type AddressKind, getConnectionState, reprobe, serverAddresses } from '../api';
import { BrandMark } from '../components/domain';
import { Button, Dot, TextField } from '../components/ui';
import { color, radius, space, Text } from '../theme';
import { noAnswer, type ServerCandidate, toBase } from './address';
import { applyAddresses, learnTailnetAddress, saveServerAddresses } from './serverStore';

// First run (SPEC §18 F1), and the front door: `app.json` ships no address, so
// the first launch of a shipped build lands here and someone types where the
// clinic PC is. A build that does carry a default — a dev machine's, or a
// clinic that baked its own in — has it probed on boot by
// `shell/serverStore.ts` and skips this screen when it answers. The rest of
// the traffic here is the clinic that moved its server and the typo: someone
// standing in front of the phone, correcting an address that did not answer.
//
// Both sides are collected because §14 resolves them in order: the LAN address
// for when the phone is on clinic wifi, the MagicDNS hostname for everywhere
// else on the tailnet.
//
// Nothing is saved on the strength of the text being well-formed. The button
// probes, and only an address that answered is written down — a typo that lands
// the secretary in the offline dead end on the next launch is the one failure
// this screen exists to prevent. A probe that fails puts the previous addresses
// back rather than leaving a broken one behind.

type Attempt = { ok: true; address: AddressKind; ms: number } | { ok: false; message: string };

const ADDRESS_LABEL: Record<AddressKind, string> = {
    lan: 'the clinic wifi',
    tailscale: 'Tailscale',
};

export function SetupScreen() {
    const current = serverAddresses();
    const [lan, setLan] = useState(current.lan ?? '');
    const [tailscale, setTailscale] = useState(current.tailscale ?? '');
    const [testing, setTesting] = useState(false);
    const [attempt, setAttempt] = useState<Attempt | null>(null);

    async function connect() {
        const candidate: ServerCandidate = { lan: toBase(lan), tailscale: toBase(tailscale) };
        if (!candidate.lan && !candidate.tailscale) {
            setAttempt({ ok: false, message: 'Enter at least one address.' });
            return;
        }

        const previous = serverAddresses();
        setAttempt(null);
        setTesting(true);

        applyAddresses(candidate);
        const startedAt = Date.now();
        const reached = await reprobe();
        const ms = Date.now() - startedAt;
        setTesting(false);

        if (!reached) {
            applyAddresses(previous);
            setAttempt({ ok: false, message: noAnswer(candidate) });
            return;
        }

        setAttempt({ ok: true, address: getConnectionState().address ?? 'lan', ms });

        // The server knows its own tailnet address and is now reachable, so ask
        // rather than keep what was typed — a hand-entered value is the older
        // of the two the moment the clinic moves. What was typed still stands
        // in when the clinic has not configured one.
        const learned = await learnTailnetAddress();
        // The shell replaces this screen as soon as the write lands, so the
        // success line is the handoff rather than something to dwell on.
        await saveServerAddresses({ lan: candidate.lan, tailscale: learned ?? candidate.tailscale });
    }

    return (
        <ScrollView
            style={styles.root}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
        >
            <View style={styles.card}>
                <BrandMark variant="clinic" size={24} />

                <Text variant="title3" style={styles.heading}>
                    Connect to the clinic
                </Text>

                <View style={styles.fields}>
                    <TextField
                        label="Clinic wifi"
                        value={lan}
                        onChangeText={setLan}
                        placeholder="192.168.1.20:3000"
                        hint="The clinic computer's address on the local network."
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="url"
                        returnKeyType="next"
                        editable={!testing}
                    />

                    <TextField
                        label="Tailscale"
                        value={tailscale}
                        onChangeText={setTailscale}
                        placeholder="clinic-pc.tailnet.ts.net:3000"
                        hint="Usually filled in by the clinic computer once connected. Leave blank."
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="url"
                        returnKeyType="done"
                        onSubmitEditing={() => void connect()}
                        editable={!testing}
                    />
                </View>

                <Button
                    label="Test & connect"
                    onPress={() => void connect()}
                    loading={testing}
                    variant="primary"
                    size="lg"
                    block
                    style={styles.action}
                />

                {attempt ? (
                    <View style={styles.result}>
                        <View style={styles.resultDot}>
                            <Dot tone={attempt.ok ? 'success' : 'danger'} />
                        </View>
                        <Text variant="footnote" tone={attempt.ok ? 'successText' : 'danger'}>
                            {attempt.ok
                                ? `Answered over ${ADDRESS_LABEL[attempt.address]} in ${seconds(attempt.ms)}`
                                : attempt.message}
                        </Text>
                    </View>
                ) : null}
            </View>
        </ScrollView>
    );
}

function seconds(ms: number): string {
    return `${(ms / 1000).toFixed(1)}s`;
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: color.canvas },
    content: { flexGrow: 1, justifyContent: 'center', padding: space[5] },
    card: {
        alignItems: 'center',
        gap: space[2],
        paddingVertical: space[8],
        paddingHorizontal: space[5],
        borderRadius: radius.xl2,
        backgroundColor: color.surface,
    },
    heading: { marginTop: space[5] },
    // The two hints carry what the standfirst used to say, so the fields start
    // closer to the heading than they did under a paragraph.
    fields: { alignSelf: 'stretch', gap: space[4], marginTop: space[5] },
    action: { marginTop: space[6] },
    result: { flexDirection: 'row', alignItems: 'center', gap: space[2], marginTop: space[2] },
    resultDot: { paddingTop: space[0.5] },
});
