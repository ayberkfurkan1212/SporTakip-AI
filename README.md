<h1 align="center">💪 SporTakip</h1>
<p align="center"><b>WhatsApp'tan kalori, makro, su ve antrenman takibi yapan yapay zekâ asistanı</b></p>

<p align="center">
  <a href="https://sportakip.tr"><img src="https://img.shields.io/badge/sportakip.tr-canlı-25D366?style=flat-square&logo=whatsapp&logoColor=white" /></a>
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/Deno-000000?style=flat-square&logo=deno&logoColor=white" />
  <img src="https://img.shields.io/badge/Supabase-3FCF8E?style=flat-square&logo=supabase&logoColor=white" />
  <img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white" />
  <img src="https://img.shields.io/badge/OpenAI-412991?style=flat-square&logo=openai&logoColor=white" />
  <img src="https://img.shields.io/badge/n8n-EA4B71?style=flat-square&logo=n8n&logoColor=white" />
  <img src="https://img.shields.io/badge/GitHub_Actions-2088FF?style=flat-square&logo=githubactions&logoColor=white" />
</p>

Kullanıcı uygulama indirmez, form doldurmaz: WhatsApp'a **"2 yumurta 1 dilim ekmek yedim"**, **"5 km koştum 28 dakikada"** ya da **"bench press 4x8 60 kg"** yazar, yemeğinin veya ürün etiketinin fotoğrafını atar, sesli mesaj gönderir. SporTakip kaydı tutar, hedefe göre kalan kaloriyi söyler, antrenmanda bir sonraki ağırlığı önerir ve hafta sonunda rapor gönderir.

🌐 **Canlı:** [sportakip.tr](https://sportakip.tr) · 🔐 [Gizlilik ve KVKK](https://sportakip.tr/gizlilik/)

> ℹ️ Bu depodaki kod, projenin **Ekim 2026 başındaki** anlık görüntüsüdür. Ürün aktif olarak geliştiriliyor; güncel kaynak kod özel bir depoda tutuluyor. Aşağıdaki açıklamalar ürünün güncel halini anlatır.

---

## Tasarım ilkesi: "AI dili anlar, kod hesaplar"

LLM yalnızca kullanıcının **ne demek istediğini** anlamak için kullanılır: niyet sınıflandırması, besin/hareket adı, miktar, birim, süre, mesafe. Kalori ve makrolar, porsiyon dönüşümleri, hedefler, antrenman ilerlemesi ve kardiyo kalorisi **deterministik TypeScript ve SQL** katmanında hesaplanır. Böylece model hataları hesaplara karışmaz; aynı girdi her zaman aynı sonucu verir. Tahmin içeren değerler (fotoğraf, web araştırması) kullanıcıya açıkça "tahmini" olarak gösterilir.

## Mimari

```
WhatsApp Cloud API
        │ webhook
        ▼
       n8n ── orkestrasyon, mesaj tekilleştirme, zamanlanmış tetikleyiciler, hata alarmları
        │
        ▼
Supabase Edge Functions (TypeScript / Deno)
  ├─ process-message   gelen her mesajı işler
  │     ├─ gpt-4o-mini        niyet ve varlık çıkarımı (25+ intent)
  │     ├─ whisper-1          sesli mesaj → metin
  │     ├─ gpt-4.1-mini / 4o  yemek fotoğrafı, barkod ve besin etiketi okuma
  │     └─ web araştırması    veritabanında olmayan besin/hareketi bulup kataloğa ekleme
  ├─ training          antrenman programları, ilerleme motoru, rekorlar, kardiyo
  ├─ send-reminders    saatlik hatırlatmalar, Pazar raporu, yönetici özeti
  └─ pdf-report        yemek planı ve aylık ilerleme raporu (PDF)
        │
        ▼
PostgreSQL (Supabase) ── 30+ tablo, RLS, CHECK kısıtları, view'lar, pg_trgm + unaccent arama

GitHub Actions ── main dalına gelen değişikliklerde edge function'ları otomatik dağıtır
```

## Özellikler

**Beslenme**
- Serbest Türkçe metinle öğün ve içecek kaydı; belirsiz öğünde soru sorma ("hangi peynir?"), kayıtlı öğünler, son öğünü tekrarlama, düzenleme ve silme
- **2.700+ kayıtlık besin veritabanı**: Türk mutfağı, paketli ürünler ve **650 zincir restoran ürünü** (McDonald's, Burger King, Popeyes, Starbucks, Tavuk Dünyası); "1 dilim", "1 kase" gibi porsiyonlar `food_portions` ile grama çevrilir
- **Fotoğraftan tanıma:** tabak fotoğrafı → öğün; **barkod** → ürün; **paket üstündeki besin değerleri tablosu** → okunup kaydedilir
- Kalan hedefe göre **"ne yesem?"** önerileri

**Antrenman**
- 7 hazır program: tüm vücut, evde dambıl, GZCLP, Push-Pull-Legs 3/6 gün, Üst/Alt ve 8 haftalık **Koşuya Başla (0 → 5 km)**; 3 soruyla kişiye uygun program önerisi
- **İlerleme motoru:** lineer ve çift ilerleme; 3 başarısızlıkta otomatik deload; her hareket için bir sonraki hedef ağırlık/tekrar
- Tahmini 1RM, kişisel rekorlar ve haftalık güç raporu
- **Kardiyo:** yürüyüş, koşu, bant, bisiklet, yüzme, eliptik, kürek, HIIT, futbol ve daha fazlası; kalori **Compendium of Physical Activities** MET değerleri ve **ACSM** metabolik denklemleriyle (hız + eğim) hesaplanır; mesafe/tempo rekorları, haftalık 150 dk hedefi

**Takip ve raporlar**
- Su, kilo, vücut ölçüsü ve takviye kaydı; günlük özet, haftalık rapor
- Zamanlanmış hatırlatmalar (11:00, 20:00), Pazar akşamı haftalık rapor

**Premium**
- Kilo trendi ve kayıtlara bakarak haftalık **akıllı kalori hedefi** ayarı
- Haftalık yemek planı ve alışveriş listesi, PDF raporlar
- Akşam koç yorumu, aralıklı oruç zamanlayıcısı, kişisel hatırlatmalar

**Ürün ve işletim**
- Onboarding: Mifflin-St Jeor ile TDEE, hedefe göre kalori ve makrolar
- Free / Premium planlar, günlük limitler, deneme süresi, ödeme kayıtları
- **KVKK:** açık onay akışı, aydınlatma metni, tek mesajla (`hesabımı sil`) tüm verilerin silinmesi
- 61 senaryoluk otomatik NLU regresyon testi; haftalık yönetici raporu (kayıt, dönüşüm, gelir) ve hata alarmları

## Veritabanı ve güvenlik

- Tüm tablolarda **Row Level Security**; her kullanıcı yalnızca kendi verisine erişir
- Değer aralıkları CHECK kısıtlarıyla veritabanı seviyesinde korunur
- `SECURITY DEFINER` fonksiyonlarının çalıştırma yetkisi istemci rollerinden kaldırılmıştır
- WhatsApp mesaj kimliği üzerinden tekilleştirme; dahili fonksiyonlar (antrenman, hatırlatma, PDF) yalnızca yetkili anahtarla çağrılabilir

Bu depodaki şema: [`supabase/schema.sql`](supabase/schema.sql)

## Bu depodaki dosyalar

```
supabase/
├── functions/
│   ├── process-message/index.ts   # mesaj işleyici (Ekim 2026 başı sürümü)
│   └── send-reminders/index.ts    # zamanlanmış bildirimler
└── schema.sql                     # veritabanı şeması
.env.example                       # gerekli ortam değişkenleri (değerler boş)
```

---

Geliştiren: [Ayberk Furkan Kaya](https://github.com/ayberkfurkan1212) · [LinkedIn](https://www.linkedin.com/in/ayberkfurkankaya) · [sportakip.tr](https://sportakip.tr)
