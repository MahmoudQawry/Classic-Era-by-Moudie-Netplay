# Moudie NetPlay — إشعارات برمجيات الطرف الثالث

هذه القائمة تطابق نوى Android التي يبنيها scripts/sync-libretro-cores.sh في الإصدار الحالي. لا يتضمن التطبيق ROM أو BIOS أو ألعابًا محمية بحقوق النشر.

| النظام | النواة | المصدر | ملاحظات الترخيص |
|---|---|---|---|
| Famicom / NES | FCEUmm | https://github.com/libretro/libretro-fceumm | راجع LICENSE/NOTICE للنواة والإصدار المستخدم في البناء. |
| PlayStation 1 | PCSX-ReARMed | https://github.com/libretro/pcsx_rearmed | GPL-2.0-or-later؛ يجب توفير المصدر والالتزامات المقابلة عند التوزيع. |
| PlayStation Portable | PPSSPP | https://github.com/hrydgard/ppsspp | GPL-2.0-or-later؛ يجب توفير المصدر والالتزامات المقابلة عند التوزيع. |
| Sega Genesis / Mega Drive | Genesis Plus GX | https://github.com/libretro/Genesis-Plus-GX | راجع LICENSE/NOTICE للنواة والإصدار المستخدم. |
| Nintendo 64 | Parallel-N64 | https://github.com/libretro/parallel-n64 | راجع LICENSE/NOTICE للنواة والإصدار المستخدم. |
| PlayStation 2 | Play! | https://github.com/jpd002/Play- | راجع LICENSE/NOTICE للمصدر والإصدار المبني؛ لا يتم تضمين ROM/BIOS. |

## سياسة الإصدار

- لا تُنشر بنائيات المحاكيات الأصلية دون الاحتفاظ بمصادر وإشعارات الإصدارات المطابقة لها.
- يجب أن يتطابق مصدر كل binary مع commit/build موثق في CI.
- لا يتم تنزيل executable cores من الإنترنت أثناء تشغيل التطبيق.
- لا تُحفظ مفاتيح LiveKit أو TURN أو Discord secrets داخل المستودع أو APK.
- المستخدم مسؤول عن امتلاك حق استخدام ROM/BIOS الخاصة به.

## ملاحظة مهمة

قبل نشر Google Play يجب إرفاق أو توفير نصوص التراخيص المطلوبة ومصادر GPL المطلوبة وفق شروط كل مشروع، ومراجعة العلامات التجارية لكل مشروع محاكاة بصورة منفصلة.