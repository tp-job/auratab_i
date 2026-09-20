# คู่มือ Deploy และ Load unpacked: AuraTab

## 0. เตรียมเครื่อง

- Node.js 18 ขึ้นไป (ไม่ต้อง `npm install` เพราะโปรเจกต์ไม่มี dependency)
- Google Chrome 123+ หรือ Microsoft Edge 123+ (ต้องใช้ CSS `light-dark()` ของ design system)

## 1. Build

```sh
npm run release      # รันเทสต์ → ตรวจสอบ → build
```

ผลลัพธ์:

| ไฟล์ | ใช้ทำอะไร |
| --- | --- |
| `dist/auratab/` | โฟลเดอร์สำหรับ **Load unpacked** (มีเฉพาะไฟล์ที่ extension ใช้) |
| `dist/auratab-<version>.zip` | แพ็กเกจสำหรับอัปโหลดขึ้น Chrome Web Store / Edge Add-ons |

ขั้นตอน build จะตรวจสอบสิ่งต่อไปนี้ และจะหยุดทันทีถ้าพบปัญหา:
- manifest เป็น MV3 และเวอร์ชันถูกรูปแบบ
- เวอร์ชันใน `package.json` ตรงกับ manifest
- ไอคอนมีครบและขนาดถูกต้อง
- คีย์ภาษา en/th ตรงกัน
- คำอธิบายไม่เกิน 132 ตัวอักษร
- ไฟล์ที่ HTML/JS อ้างถึงมีอยู่จริง
- ไม่มีโค้ดที่โหลดจากภายนอกหรือ `eval` (ถ้ามี store จะปฏิเสธ)
- **Design system:** ส่วน L3 ของ CSS ต้องไม่มีสีแบบ hex/rgb ตรงๆ (ต้องใช้ token) และไม่มี font-weight เกิน 600
- เทสต์ `tests/design-tokens.test.mjs` วัด contrast ของ token จริงจาก CSS ทั้งโหมดสว่างและมืด

## 2. Load unpacked (ทดสอบในเครื่อง)

### Google Chrome
1. เปิด `chrome://extensions`
2. เปิด **Developer mode** (มุมขวาบน)
3. กด **Load unpacked** แล้วเลือกโฟลเดอร์ `dist/auratab`
4. เปิดแท็บใหม่ (`Ctrl+T`) แล้วจะเห็น AuraTab
   - ถ้า Chrome ถามว่า "Change back to Google?" ให้กด **Keep it**

### Microsoft Edge
1. เปิด `edge://extensions`
2. เปิด **Developer mode** (แถบซ้ายล่าง)
3. กด **Load unpacked** แล้วเลือกโฟลเดอร์ `dist/auratab`
4. เปิดแท็บใหม่ แล้วกด **Keep changes** เมื่อ Edge ถามถึงการเปลี่ยนหน้า New Tab

### รอบแก้ไขโค้ด
1. แก้ไฟล์ใน source (`js/`, `css/`, `newtab.html`, `_locales/`)
2. รัน `npm run build` (build จะเขียนทับ `dist/auratab` ที่เดิม)
3. กดปุ่ม **Reload** ⟳ ของ AuraTab ในหน้า extensions แล้วเปิดแท็บใหม่

> อยากแก้แล้วเห็นผลทันทีโดยไม่ต้อง build ก็ได้ ให้ Load unpacked ที่ **โฟลเดอร์รากของโปรเจกต์** แทน
> แต่ก่อนส่ง store ให้ทดสอบกับ `dist/auratab` อีกรอบ เพราะเป็นชุดไฟล์เดียวกับที่อยู่ใน zip

### Checklist ทดสอบก่อนส่ง
- [ ] Most visited แสดงไอคอนเว็บจริง (favicon)
- [ ] บุ๊กมาร์กแสดงครบ แยกตามโฟลเดอร์ เพิ่มหรือลบบุ๊กมาร์กแล้วหน้าอัปเดตเอง
- [ ] กด `/` แล้วค้นหาได้ `Enter` เปิดรายการแรก และถ้าไม่พบจะค้นหาเว็บ
- [ ] ซ่อนเว็บแล้วกด Undo ได้ ยุบโฟลเดอร์แล้วยังจำสถานะได้หลังเปิดแท็บใหม่
- [ ] Settings ใช้ได้ทุกตัว: ธีม, ความหนาแน่น, จำนวนเว็บ, ลำดับบุ๊กมาร์ก
- [ ] ลิงก์ `chrome://` หรือ `edge://` ในบุ๊กมาร์กเปิดได้
- [ ] เปลี่ยนภาษาเบราว์เซอร์เป็นไทยแล้ว UI เป็นภาษาไทย
- [ ] รัน `node scripts/store-assets.mjs --qa` แล้วดูภาพใน `dist/qa/` ทั้ง 375 / 768 / 1024 / 1440 ทั้งสว่างและมืด (design-system §8)
- [ ] กด Tab ไล่ทุกปุ่มแล้วเห็น focus ring ชัดเจน
- [ ] ไม่มี error ในหน้าเว็บ (คลิกขวา → Inspect → Console) และในหน้า extensions ไม่มีปุ่ม **Errors**

## 3. ออกเวอร์ชันใหม่

```sh
npm run bump            # 1.0.0 → 1.0.1  (หรือ: npm run bump -- minor | major | 1.2.0)
npm run release
```

Store ไม่รับเวอร์ชันซ้ำ ดังนั้นทุกครั้งที่อัปโหลดต้อง bump เวอร์ชันก่อน

## 4. ส่งขึ้น Store

ข้อความทั้งหมดสำหรับคัดลอกไปวาง (คำอธิบาย, เหตุผลของแต่ละ permission, single purpose) อยู่ใน [`store/LISTING.md`](../store/LISTING.md)
รูปภาพอยู่ใน `store/` และสร้างใหม่ได้ด้วย `npm run store-assets`

### ก่อนส่งครั้งแรก
1. ใส่อีเมลติดต่อใน [`PRIVACY.md`](../PRIVACY.md)
2. โฮสต์ `PRIVACY.md` ให้เป็นหน้าเว็บสาธารณะ (เช่น GitHub Pages หรือ Gist) เพื่อนำ URL ไปใส่ใน store
   เหตุผล: extension อ่าน topSites ซึ่ง store นับเป็น *Web history* จึงต้องมี privacy policy

### Chrome Web Store
1. สมัคร developer ที่ <https://chrome.google.com/webstore/devconsole> (ค่าธรรมเนียมครั้งเดียว US$5)
2. **New item** แล้วอัปโหลด `dist/auratab-<version>.zip`
3. แท็บ **Store listing**: ใส่คำอธิบาย, หมวดหมู่, ไอคอน, screenshots และ promo tile 440×280
4. แท็บ **Privacy practices**: ใส่ single purpose, เหตุผลของแต่ละ permission, remote code = No, data usage = Web history และติ๊ก certification ทั้ง 3 ข้อ
5. **Submit for review** (ปกติใช้เวลา 1–3 วันทำการ)

### Microsoft Edge Add-ons
1. สมัครที่ <https://partner.microsoft.com/dashboard/microsoftedge> (ฟรี)
2. **Create new extension** แล้วอัปโหลด zip ไฟล์เดียวกัน
3. **Availability**: เลือก Public และตลาดที่ต้องการ
4. **Properties**: ใส่หมวดหมู่ Productivity และ URL ของ privacy policy
5. **Store listings**: ใส่ข้อมูลทั้ง English และ Thai พร้อม logo 300×300, screenshots และ promo tiles
6. **Publish** (ปกติรีวิวไม่เกิน 7 วันทำการ)

> อัปเดตเวอร์ชันถัดไป: `npm run bump` → `npm run release` → อัปโหลด zip ใหม่ในรายการเดิม (ไม่ต้องสร้างรายการใหม่)
