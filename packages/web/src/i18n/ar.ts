/**
 * Arabic is the canonical dictionary — `Dictionary` is derived from it, so a
 * key added here that is missing from `en.ts` is a type error, not a string
 * that quietly shows up untranslated on the doctor's phone.
 *
 * `{name}` placeholders are filled by `t(key, { name: … })`.
 */
export const ar = {
    'app.name': 'مَوعِد',

    'locale.switch': 'English',
    'locale.switchLabel': 'تغيير اللغة',

    'status.heading': 'حالة النظام',
    'status.socket': 'الاتصال المباشر',
    'status.db': 'قاعدة البيانات',
    'status.printer': 'الطابعة',
    'status.whatsapp': 'واتساب',
    'status.ok': 'يعمل',
    'status.degraded': 'متقطع',
    'status.down': 'متوقف',
    'status.disabled': 'غير مُفعّل',
    'status.meta': 'الإصدار {version} · يعمل منذ {uptime} ثانية',

    'appointmentTypes.heading': 'أنواع المواعيد',
    'appointmentTypes.minutes': '{minutes} دقيقة',

    'config.loadFailed': 'تعذّر تحميل إعدادات العيادة: {message}',

    'patient.badId': 'رقم المريض في الرابط غير صالح.',
    'patient.loadFailed': 'تعذّر تحميل بيانات المريض: {message}',
    'patient.notes': 'ملاحظات',
    'patient.nextVisit': 'الموعد القادم',
    'patient.history': 'سجل المواعيد',
    'patient.noHistory': 'لا توجد مواعيد لهذا المريض.',

    'day.prev': 'اليوم السابق',
    'day.next': 'اليوم التالي',
    'day.today': 'اليوم',
    'day.heading': 'المواعيد',
    'day.count': 'الإجمالي: {count}',
    'day.empty': 'لا توجد مواعيد في هذا اليوم.',
    'day.closed': 'العيادة مغلقة في هذا اليوم.',
    'day.loadFailed': 'تعذّر تحميل المواعيد: {message}',

    'appt.booked': 'محجوز',
    'appt.done': 'تم',
    'appt.cancelled': 'ملغي',
    'appt.no_show': 'لم يحضر',

    'book.heading': 'حجز موعد',
    'book.type': 'نوع الموعد',
    'book.slots': 'الأوقات المتاحة',
    'book.noSlots': 'لا توجد أوقات متاحة في هذا اليوم.',
    'book.loadSlotsFailed': 'تعذّر تحميل الأوقات: {message}',
    'book.sheetTitle': 'تأكيد الحجز',
    'book.when': '{date} · {time} · {duration} دقيقة',
    'book.patient': 'المريض',
    'book.existing': 'مريض حالي',
    'book.new': 'مريض جديد',
    'book.searchLabel': 'ابحث بالاسم أو رقم الهاتف',
    'book.searchPlaceholder': 'اكتب اسمًا أو رقمًا…',
    'book.searching': 'جاري البحث…',
    'book.noResults': 'لا توجد نتائج.',
    'book.nameLabel': 'الاسم',
    'book.phoneLabel': 'رقم الهاتف',
    'book.noteLabel': 'ملاحظة (اختياري)',
    'book.confirm': 'تأكيد الحجز',
    'book.confirming': 'جاري الحجز…',
    'book.cancel': 'إلغاء',
    'book.close': 'إغلاق',
    'book.needPatient': 'اختر مريضًا أولاً.',
    'book.failed': 'تعذّر الحجز: {message}',

    'print.failedHeading': 'لم تتم الطباعة',
    'print.slipJob': 'إيصال الموعد رقم {id}',
    'print.dayJob': 'جدول يوم {date}',
    'print.driver': 'الطابعة: {driver}',
    'print.attempts': 'بعد {attempts} محاولات',
    'print.retry': 'إعادة الطباعة',
    'print.retrying': 'جاري الإرسال…',
    'print.dismiss': 'تجاهل',
    'print.retryFailed': 'تعذّر إرسال أمر الطباعة: {message}',

    'scan.label': 'مسح ضوئي',
    'scan.withName': 'تم مسح موعد {name}',
    'scan.withoutName': 'تم مسح ورقة موعد',
    'scan.open': 'فتح',
    'scan.dismiss': 'تجاهل',

    'common.retry': 'إعادة المحاولة',
    'common.loading': 'جاري التحميل…',

    'notFound.heading': 'الصفحة غير موجودة',
    'notFound.body': 'الرابط الذي فتحته غير صحيح أو لم يعد متاحًا.',
    'notFound.back': 'العودة إلى شاشة المواعيد',

    'error.BAD_REQUEST': 'طلب غير صالح.',
    'error.VALIDATION_FAILED': 'من فضلك راجع البيانات المُدخلة.',
    'error.NOT_FOUND': 'غير موجود.',
    'error.INTERNAL': 'حدث خطأ في النظام.',
    'error.SLOT_TAKEN': 'هذا الموعد محجوز بالفعل.',
    'error.PATIENT_NOT_FOUND': 'لم يتم العثور على المريض.',
    'error.APPOINTMENT_NOT_FOUND': 'لم يتم العثور على الموعد.',
    'error.OUTSIDE_WORKING_HOURS': 'هذا الوقت خارج مواعيد العمل.',
    'error.PRINTER_UNAVAILABLE': 'الطابعة غير متاحة.',
    'error.WHATSAPP_DISCONNECTED': 'واتساب غير متصل.',
} as const;
