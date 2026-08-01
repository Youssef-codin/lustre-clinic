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
