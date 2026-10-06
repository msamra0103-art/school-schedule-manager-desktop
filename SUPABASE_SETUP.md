# إعداد Supabase

قاعدة البيانات منشأة بالفعل في مشروع `zvyizjldreanejcfyxba` داخل حساب `m.samra0103`.

## محتويات قاعدة البيانات

- `schedule_accounts`: المديرون والصلاحيات والأقسام.
- `schedule_state`: آخر نسخة موحدة من بيانات الجدول مع رقم مراجعة.
- `schedule_audit_log`: سجل تغييرات إداري.
- سياسات RLS تمنع المستخدم غير المسجل وتفصل حساب القسم عن الإدارة الكاملة.
- الدالتان `save_schedule_state` و`save_department_substitutions` تنفذان الحفظ المسموح فقط.

## إعادة إنشاء القاعدة في مشروع جديد مستقبلًا

طبّق ملفات `supabase/migrations` بالترتيب الزمني باستخدام Supabase CLI أو SQL Editor. ثم عدّل القيمتين `url` و`publishableKey` في `site/supabase-config.js`.

لا تستخدم مفتاح `service_role` داخل الموقع أو برنامج سطح المكتب ولا تحفظه في GitHub.
