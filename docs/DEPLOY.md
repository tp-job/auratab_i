# คู่มือ Deploy และ Load unpacked: Atelier Launchpad

## 0. เตรียมเครื่อง

- Node.js 18 ขึ้นไป (ไม่ต้อง `npm install` เพราะโปรเจกต์ไม่มี dependency)
- Google Chrome 123+ หรือ Microsoft Edge 123+

## 1. Build

```sh
npm run release      # รันเทสต์ → ตรวจสอบ → build
```

| ไฟล์ | ใช้ทำอะไร |
| --- | --- |
| `dist/atelier-launchpad/` | โฟลเดอร์สำหรับ **Load unpacked** (มีเฉพาะไฟล์ที่ extension ใช้) |
| `dist/atelier-launchpad-<version>.zip` | แพ็กเกจสำหรับอัปโหลดขึ้น Chrome Web Store / Edge Add-ons |

ขั้นตอน build จะหยุดทันทีถ้าพบปัญหาต่อไปนี้:
- manifest ไม่ใช่ MV3 หรือรูปแบบเวอร์ชันผิด หรือเวอร์ชันไม่ตรงกับ `package.json`
- ไอคอนขาดหรือขนาดไม่ถูกต้อง
- **รูปแบบการใช้งานแบบคลิกไอคอน:** ห้ามมี `chrome_url_overrides` (ต้องไม่แทนที่หน้า New Tab), ต้องมี `action` ที่ไม่มี popup, และต้องมีคีย์ลัด `_execute_action`
- CSP ไม่มี `connect-src 'none'`, หรือ HTML มี inline style / inline script
- คีย์ภาษา en/th ไม่ตรงกัน หรือโค้ดเรียกใช้คีย์ข้อความที่ไม่มีอยู่
- มีโค้ดหรือไฟล์ที่โหลดจากภายนอก หรือมี `eval`
- มี font-weight เกิน 600

## 2. Load unpacked (ทดสอบในเครื่อง)

> ถ้ายังติดตั้ง AuraTab อยู่ ให้ลบออกก่อน ไม่เช่นนั้นหน้า New Tab จะยังถูกแทนที่อยู่

1. เปิด `chrome://extensions` (หรือ `edge://extensions`) แล้วเปิด **Developer mode**
2. กด **Load unpacked** แล้วเลือกโฟลเดอร์ `dist/atelier-launchpad`
3. Launchpad จะเปิดขึ้นเองหนึ่งครั้งพร้อมคำแนะนำให้ **ปักหมุดไอคอน** (เมนูรูปจิ๊กซอว์ → ปักหมุด)
4. หลังจากนั้นให้คลิกไอคอน หรือกด `Alt+Shift+L` เพื่อเปิด Launchpad

### รอบแก้ไขโค้ด
1. แก้ไฟล์ใน source (`js/`, `css/`, `launchpad.html`, `background.js`, `_locales/`)
2. รัน `npm run build` (จะเขียนทับ `dist/atelier-launchpad` ที่เดิม)
3. กด **Reload** ⟳ ในหน้า extensions

### Checklist ทดสอบก่อนส่ง
- [ ] หน้า New Tab (`Ctrl+T`) ยังเป็นของเบราว์เซอร์ตามปกติ
- [ ] คลิกไอคอนแล้ว Launchpad เปิดข้างแท็บปัจจุบัน
- [ ] คลิกไอคอนจากแท็บอื่นแล้วสลับไปแท็บ Launchpad เดิม โดยไม่เปิดแท็บซ้ำ
- [ ] คลิกไอคอนขณะอยู่ที่ Launchpad แล้วกลับไปยังแท็บเดิม
- [ ] `Alt+Shift+L` ทำงานเหมือนการคลิกไอคอน
- [ ] ถ้ายังไม่ได้ปักหมุดไอคอนจะเห็นคำแนะนำ พอปักหมุดแล้วคำแนะนำหายไปเอง
- [ ] เว็บที่ใช้บ่อยแสดง favicon จริง และปักหมุดหรือซ่อนเว็บได้
- [ ] บุ๊กมาร์กแสดงครบแยกตามโฟลเดอร์ เพิ่มหรือลบบุ๊กมาร์กแล้วหน้าอัปเดตเอง และลิงก์ `chrome://` เปิดได้
- [ ] กด `/` แล้วค้นหาได้ ส่วน `Enter` จะเปิดรายการที่เลือก
- [ ] เปลี่ยนภาษาเบราว์เซอร์เป็นไทยแล้ว UI เป็นภาษาไทย
- [ ] ไม่มี error ใน Console ของหน้า และในหน้า extensions ไม่มีปุ่ม **Errors**

## 3. ออกเวอร์ชันใหม่

```sh
npm run bump            # 2.0.0 → 2.0.1  (หรือ: npm run bump -- minor | major | 2.1.0)
npm run release
```

## 4. ส่งขึ้น Store

- ใส่อีเมลติดต่อใน [`PRIVACY.md`](../PRIVACY.md) แล้วโฮสต์เป็นหน้าเว็บสาธารณะ ต้องมี privacy policy เพราะ extension อ่าน `history`
- ข้อความ listing และรูปของ AuraTab เดิมอยู่ใน `legacy/auratab/store/` ต้องเขียนใหม่และถ่าย screenshot ใหม่ให้เป็น Launchpad
- Single purpose: "เปิด Launchpad ของเว็บที่ใช้บ่อย บุ๊กมาร์ก และช่องค้นหา เมื่อผู้ใช้คลิกไอคอน"
- เหตุผลของแต่ละ permission ดูได้ในตาราง Permissions ของ [`README.md`](../README.md)
- ขั้นตอนบน Chrome Web Store และ Edge Add-ons เหมือนคู่มือเดิมใน `legacy/auratab/docs/DEPLOY.md` ข้อ 4 แต่ให้อัปโหลด `dist/atelier-launchpad-<version>.zip` แทน
