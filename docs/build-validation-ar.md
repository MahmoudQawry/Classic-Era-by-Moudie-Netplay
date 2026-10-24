# دليل التحقق والبناء لنظام Android (Android Build & Validation Guide)

هذا المستند يوثق متطلبات وآلية التحقق من بناء تطبيق Classic Era by Moudie وإنتاج حزمة APK النهائية:

## 1. المتطلبات الأساسية
- Node.js 20+
- pnpm 9+
- Java 17 (Temurin JDK)
- Android SDK (API 34 / NDK r26+)

## 2. خطوات الفحص والبناء
```bash
# فحص الأنواع البرمجية
pnpm check

# تشغيل الاختبارات
pnpm test

# توليد ملفات Android
npx expo prebuild --platform android

# بناء APK Release
cd android && ./gradlew assembleRelease
```
