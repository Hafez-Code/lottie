# الاستفادة من diffusionstudio/editor في Studio ProMax

تاريخ المراجعة: 2026-10-01. تمت مراجعة README ووثائق الأدوات وملفات تعريف الحزم وكود Electron عبر GitHub؛ لم يتم تنزيل المستودع أو دمج كوده أو تشغيله محليًا.

## النتيجة

المستودع مناسب كمرجع معماري للمشروع: يستخدم SolidJS وElectron، ويدعم دورة عمل يكتب فيها الـ agent المصدر ثم يفحص المشهد الناتج. لكنه ليس إضافة جاهزة لمحرّك Lottie: يعتمد على مشروعات JSX ومحرّك ECS وميديا فيديو، بينما التطبيق الحالي يعتمد على Lottie JSON وCanvasKit.

## الأجزاء المفيدة

- حزمة [agent-chat](https://github.com/diffusionstudio/editor/blob/main/packages/agent-chat/package.json): مضيف Node لتشغيل Claude Code أو Codex داخل المشروع عبر WebSocket، مع بروتوكول وعميل وإدارة حالة صالحة للمتصفح. مناسبة لدراسة البث والجلسات بدل بناء كل التفاصيل من الصفر. تعتمد على Claude Agent SDK وws وتصدر ملفات TypeScript داخل monorepo؛ لم نتحقق من إمكانية تثبيتها كحزمة مستقلة. دعم OpenCode المذكور على مستوى التطبيق لا يعني أن هذه الحزمة تدعمه بالضرورة.
- [أدوات MCP وCLI](https://github.com/diffusionstudio/editor/blob/main/docs/reference/tools/README.md): تعريفات موحدة ونتائج منظمة، capture للمشاهد وcheck للبنية، وفحص الفيديو عبر grab وfilmstrip وprobe. مفيدة لتوسيع التحقق من فريم واحد إلى عدة فريمات وإعطاء الـ agent سياقًا أدق.
- [Electron main](https://github.com/diffusionstudio/editor/blob/main/apps/desktop/src/main.ts): إدارة جذور المشاريع والمراقبة وتسجيل MCP وتشغيل مضيف الشات. مفيد كمرجع لتقسيم خدمات التطبيق وتحسين الحفظ الذري.
- [runtime](https://github.com/diffusionstudio/editor/blob/main/packages/runtime/package.json): محرّك headless مبني على koota وmediabunny وله اعتماديات داخلية. استخدامه يتطلب تغيير نموذج المشاهد وليس مجرد استبدال مكتبة رسم.

## التوصية

الحفاظ على التصميم الحالي وLottie/CanvasKit، ثم تطوير جلسات الـ agents والبث والتحقق متعدد الفريمات ونتائج MCP المنظمة تدريجيًا. إذا اتسع المنتج لاحقًا إلى محرر فيديو متكامل، يمكن تقييم انتقال منفصل إلى محرّك المستودع بعد تجربة التوافق والتصدير.

المستودع معلن بترخيص MPL-2.0، وأصول علامته التجارية مستثناة حسب [README](https://github.com/diffusionstudio/editor). أي نقل للكود يحتاج مراعاة ترخيص الملفات. لم ننسخ كودًا أو أصولًا منه في هذه الدفعة.

## الدمج المنفذ في v004

نُقل حساب تخطيط contact sheets من packages/encoder/src/contact-sheet.ts عند commit f1f6d87862e50b9a79dafd9247e5b17c58a2a1a0 إلى src/vendor/diffusionstudio/contact-sheet.ts مع ترخيصه وإشعار المصدر، وربطنا الرسم بمحرك Lottie الحالي. أُضيفت أداتا capture_scene_frames وcheck_scene إلى MCP، وتحوّل التحقق البصري في مسار API إلى صورة فريمات البداية والوسط والنهاية. الفحص البنيوي مكتوب خصيصًا لـ Lottie وليس نقلًا لفحص JSX. لم تُدمج حزمة agent-chat أو محرّك الفيديو؛ جلسات agents الحالية ما زالت تستخدم خدمات المشروع المحلية.
