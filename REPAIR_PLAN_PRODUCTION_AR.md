# خطة بدء التصليح الفعلي — Classic Era by Moudie NetPlay

هذه الخطة هي ترتيب التنفيذ المقترح بعد تدقيق المستودع. لا يتم تشغيل Android build أو Release build في هذه المرحلة.

## 1. تثبيت المعمارية
- حسم realtime backend: Cloudflare Durable Objects أو Express/Socket.IO.
- منع وجود مسارين إنتاجيين يطبقان semantics مختلفة للغرف والجلسات.
- إنشاء مصدر حقيقة واحد لتعريف الأنظمة والسعات والبروتوكول.
- توحيد Client / Server / Cloudflare / Native حول نفس contracts.

## 2. Session Engine
- إضافة SessionManager.
- إضافة SeatManager بمقاعد ثابتة بدل الاعتماد على ترتيب memberId.
- إضافة SessionStateMachine بحالات: WAITING, READY_CHECK, SYNCING, RUNNING, RECONNECTING, ENDED, CLOSED.
- إضافة sessionId مستقل عن roomId.
- ربط كل realtime packet بـ sessionId عندما يكون ذلك مطلوبًا.

## 3. NetPlay Protocol
- تعريف events رسمية لإنشاء الجلسة والانضمام والاستعداد والبدء والإدخال وACK والـsnapshot والـresync والـreconnect والإنهاء.
- تعريف schema وsender وreceiver وsequence/frame number وtimeout وretry وmaximum payload لكل event.
- استخدام validation موحد على الخادم والعميل.

## 4. State Synchronization
الاختبار المطلوب يجب أن يكون عمليًا بين جهازين، وليس unit test فقط:
1. جهاز A ينشئ الغرفة.
2. جهاز B ينضم.
3. يتم التحقق من fingerprint وcore version.
4. يتم تثبيت المقاعد.
5. يتم bootstrap للحالة.
6. يبدأ frame synchronization.
7. يتم إدخال latency وpacket loss.
8. يحدث divergence.
9. يطلب الجهاز state.
10. يتم تحميل snapshot وإعادة المحاكاة.
11. يجب أن تعود الجلسة للحالة الصحيحة.

## 5. Rollback
- اختبار checkpoint وprediction وlate input وrollback وإعادة تشغيل frames.
- اختبار RTT: 20ms, 50ms, 100ms, 150ms, 200ms.
- اختبار packet loss: 1%, 5%, 10%.
- تسجيل rollback depth وcorrection count وresync duration.
- عدم اعتبار وجود RollbackBuffer وحده إثباتًا لعمل rollback داخل emulator runtime.

## 6. Reconnect
- اختبار انقطاع 2 ثانية ثم 10 ثوانٍ ثم 30 ثانية.
- إعادة إثبات هوية العضو.
- استعادة seat.
- التحقق من sessionId.
- معرفة آخر frame مؤكد.
- طلب missing state/input.
- استكمال الجلسة بدون إنشاء session جديدة إذا كانت الجلسة الأصلية ما زالت صالحة.

## 7. Cloudflare / Express
إذا أصبح Cloudflare هو realtime authority، يجب نقل room lifecycle وcapacity وreadiness وsession start وstate relay وresync إليه، وربط الصوت فعليًا.
إذا أصبح Express هو authority، يجب إيقاف Cloudflare realtime من المسار الإنتاجي وتوحيد Socket.IO وuniversal وPS1 adapters.
لا ينبغي الإبقاء على اختلاف في room capacity أو state protocol بين المسارين.

## 8. Room lifecycle
- إضافة lastActivityAt وexpiresAt وclosedAt وhostMemberId وactiveSessionId.
- تنظيف الغرف الخاملة.
- تنظيف snapshots وinput history وsockets.
- ضمان عدم بقاء members أو sessions يتيمة.

## 9. Host migration
- اكتشاف خروج المضيف.
- grace period.
- اختيار host جديد بطريقة deterministic.
- إرسال التغيير لكل المشاركين.
- إبقاء sessionId ثابتًا إذا أمكن استمرار الجلسة.

## 10. Security
- rate limiting لإنشاء وانضمام وإعادة اتصال الغرف.
- حماية من duplicate connections.
- session isolation.
- production CORS allowlist.
- limits منفصلة للـAPI والـsnapshots.
- schema validation لكل realtime event.
- حماية public lobby من spam.

## 11. Database
- إضافة Foreign Keys المناسبة.
- مراجعة unique constraints وindexes.
- اختبار concurrent join.
- اختبار امتلاء آخر مقعد.
- اختبار join أثناء reconnect.
- اختبار إغلاق الغرفة أثناء join.

## 12. Native Emulator Contract
كل emulator adapter يجب أن يلتزم بدورة موحدة: initialize, loadGame, loadCore, getCapabilities, setInput, getState, loadState, startNetplay, stopNetplay, pause, resume, dispose.

## 13. Compatibility Matrix
NES: ROM formats و2 players وstate sync وreconnect.
PS1: BIN/CUE وISO وCHD وPBP وBIOS وmulti-disc وmemory card.
PSP: ISO وCSO وCHD وPBP وPPSSPP settings.
Sega: 3-button و6-button وstate sync.
N64: Z64/N64/V64 وanalog وcontroller pak وrumble وtiming.
PS2: ISO وCHD وCSO وCUE وELF وISZ ومتطلبات العتاد والـrendering.
لا يعلن دعم نظام إلا بعد وجود اختبار حقيقي موثق له.

## 14. Observability
إضافة telemetry لـroom creation وjoin failure وsession start/failure وdisconnect/reconnect وstate sync وdesync وrollback وemulator crash وcore load failure وfingerprint mismatch.
تسجيل system وcore وapp version وcore version وsessionId وRTT وjitter وpacket loss وrollback depth وstate size وduration، مع عدم تسجيل محتوى ROM أو البيانات الحساسة.

## 15. Crash reporting
- native crashes.
- ANR.
- OOM.
- emulator crashes.
- startup crashes.
- core loading failures.
- Play!/PS1/PSP/N64 native failures.

## 16. اختبار الجهازين الحقيقيين
لكل نظام مدعوم: create room → join → fingerprint → core validation → seat assignment → ready → start → gameplay → latency → packet loss → disconnect → reconnect → state resync → voice → chat → end → cleanup.

## 17. Release gates
- TypeScript check.
- Lint.
- Unit tests.
- Integration tests.
- Backend smoke tests.
- Two-device NetPlay.
- Network chaos.
- Native compatibility matrix.
- Crash-free startup.
- Release artifact inspection.

## ترتيب التنفيذ
Sprint 1: backend decision + shared contracts + sessionId + seat manager.
Sprint 2: unified protocol + lifecycle + reconnect.
Sprint 3: state bootstrap + resync + rollback validation.
Sprint 4: two-device testing + network chaos.
Sprint 5: security + database integrity + cleanup.
Sprint 6: telemetry + crash reporting.
Sprint 7: emulator compatibility matrix.
Sprint 8: production release gates.

## معيار الجاهزية
نجاح Android build وحده لا يعني أن البرنامج Production Ready. معيار الجاهزية هو نجاح جلسة لعب كاملة بين جهازين حقيقيين، مع reconnect وstate resync وتحت ظروف شبكة طبيعية وسيئة، مع backend واحد واضح ومراقبة للأخطاء.