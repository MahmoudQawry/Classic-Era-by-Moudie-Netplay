# Moudie NetPlay — production server

هذه الحزمة هي خادم Moudie NetPlay الفعلي الذي يحتاجه التطبيق: API للغرف، MySQL للحالة الدائمة، Socket.IO للمزامنة والإشارات، LiveKit للصوت الجماعي، وTURN لعبور NAT، مع Caddy لـ HTTPS/WSS.

## اختيار البنية

للبداية نستخدم VPS/VM Linux دائم بعنوان عام ثابت. AWS Middle East (UAE) me-central-1 منطقة مناسبة كبداية بسبب قربها من مستخدمي الخليج، ويمكن لاحقاً إضافة عقد إقليمية أخرى.

المواصفات العملية المبدئية: 4 vCPU، 8 GB RAM، SSD 80 GB أو أكثر، IPv4 ثابت، ونطاق DNS تملكه.

## DNS

أنشئ ثلاثة سجلات A تشير إلى IPv4 الخادم:

- netplay.example.com
- livekit.example.com
- turn.example.com

استبدل example.com بنطاقك الحقيقي. Caddy يحتاج أن تكون سجلات DNS صحيحة وأن تكون المنافذ 80 و443 متاحة حتى يدير شهادات HTTPS العامة تلقائياً.

## التشغيل

من داخل المستودع على Ubuntu:

    sudo bash infra/realtime/install-ubuntu.sh

السكربت يثبت Docker، ينشئ الأسرار عشوائياً، يجهز قاعدة البيانات وRedis وLiveKit وTURN وCaddy، يفتح المنافذ، ثم يتحقق من /api/health.

## المنافذ

- TCP 80/443: HTTPS وWSS.
- UDP 443: TURN/UDP.
- TCP/UDP 3478: TURN/STUN fallback.
- TCP 7881: ICE/TCP fallback.
- UDP 50000-60000: LiveKit WebRTC.
- UDP 49160-49260: TURN relay.

## قاعدة البيانات

أضيفت migration 0004_moudie_six_systems.sql لأن schema الحالي يدعم N64 وPS2 بينما سلسلة migrations القديمة لم تكن تضيفهما إلى enum الخاص بالغرف.

## الأمان

- لا تحفظ .env.production في Git.
- لا تضع LIVEKIT_API_SECRET أو TURN_SHARED_SECRET في APK.
- Redis مربوط على loopback ولا ينبغي فتح 6379 للإنترنت.
- MySQL لا يحتاج أي منفذ عام.
- استخدم عنواناً عاماً ثابتاً للخادم.

## بعد تشغيل الخادم

يجب أن يكون:

    https://YOUR_API_DOMAIN/api/health

يرجع JSON يحتوي على ok=true.

بعد ذلك يتم ضبط GitHub Actions على:

    NETPLAY_SERVICE_URL=https://YOUR_API_DOMAIN

ويعاد بناء APK. CI في المشروع يرفض إنتاج APK online عندما لا يكون خادم NetPlay حقيقياً وصحياً.

ملاحظة: ملفات البنية والتنفيذ داخل المستودع يمكن تجهيزها بالكامل هنا، لكن إنشاء VM مدفوعة أو تسجيل نطاق أو تعديل حساب AWS/مزود الاستضافة يحتاج وصولاً فعلياً إلى الحساب الخارجي؛ لا يمكن للمستودع وحده إنشاء مورد سحابي مدفوع.
