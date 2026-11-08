<h1 align="center">💪 SporTakip</h1>
<p align="center"><b>WhatsApp'tan kalori, makro, su ve antrenman takibi yapan yapay zekâ asistanı</b></p>

<p align="center">
  <a href="https://sportakip.tr"><img src="https://img.shields.io/badge/sportakip.tr-canlı-25D366?style=flat-square&logo=whatsapp&logoColor=white" /></a>
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/Deno-000000?style=flat-square&logo=deno&logoColor=white" />
  <img src="https://img.shields.io/badge/Supabase-3FCF8E?style=flat-square&logo=supabase&logoColor=white" />
  <img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white" />
  <img src="https://img.shields.io/badge/OpenAI-412991?style=flat-square&logo=openai&logoColor=white" />
  <img src="https://img.shields.io/badge/pgvector-336791?style=flat-square&logo=postgresql&logoColor=white" />
  <img src="https://img.shields.io/badge/n8n-EA4B71?style=flat-square&logo=n8n&logoColor=white" />
  <img src="https://img.shields.io/badge/GitHub_Actions-2088FF?style=flat-square&logo=githubactions&logoColor=white" />
</p>

Kullanıcı uygulama indirmez, form doldurmaz: WhatsApp'a **"2 yumurta 1 dilim ekmek yedim"**, **"5 km koştum 28 dakikada"** ya da **"bench press 4x8 60 kg"** yazar, yemeğinin veya ürün etiketinin fotoğrafını atar, sesli mesaj gönderir. SporTakip kaydı tutar, hedefe göre kalan kaloriyi söyler, antrenmanda bir sonraki ağırlığı önerir ve hafta sonunda rapor gönderir.

🌐 **Canlı:** [sportakip.tr](https://sportakip.tr) · 🔐 [Gizlilik ve KVKK](https://sportakip.tr/gizlilik/)

> ℹ️ Bu depodaki kod, projenin **Ekim 2026 başındaki** anlık görüntüsüdür. Ürün aktif olarak geliştiriliyor; güncel kaynak kod özel bir depoda tutuluyor. Aşağıdaki açıklamalar ürünün güncel halini anlatır.

## Son güncellemeler

- **Kasım 2026:** "Her zamanki kahvaltım" gibi tek mesajla alışkanlık öğünü kaydı; `geri al` komutu; WhatsApp Flows ile uygulama içi kayıt formu; hedefleri bozmayan "hafif gün"; paylaşılabilir ilerleme kartı; besin değerlerinde kaynak etiketi ve fotoğraf analizinde saat bağlamı; elle girilen hedefin korunması ve "hedeflerimi yeniden hesapla"; tanıtım sitesinde 37 sayfalık Türk yemekleri kalori rehberi; kapsamlı güvenlik denetimi ve düzeltmeleri (ödeme eşleştirme, atomik sayaçlar, acil durdurma anahtarı, kendi sunucusundan yazı tipleri ve çerçeve koruması)

---

## Tasarım ilkesi: "AI dili anlar, kod hesaplar"

LLM yalnızca kullanıcının **ne demek istediğini** anlamak için kullanılır: niyet sınıflandırması, besin/hareket adı, miktar, birim, süre, mesafe. Kalori ve makrolar, porsiyon dönüşümleri, hedefler, antrenman ilerlemesi ve kardiyo kalorisi **deterministik TypeScript ve SQL** katmanında hesaplanır. Böylece model hataları hesaplara karışmaz; aynı girdi her zaman aynı sonucu verir. Tahmin içeren değerler (fotoğraf, web araştırması) kullanıcıya açıkça "tahmini" olarak gösterilir.

## Mimari

```
WhatsApp Cloud API
        │ webhook (Meta imza doğrulaması, mesaj kimliğiyle tekilleştirme)
        ▼
Supabase Edge Functions (TypeScript / Deno)
  ├─ whatsapp-webhook  imzayı doğrular, mesajı işletir, cevabı gönderir
  ├─ process-message   gelen her mesajı işler
  │     ├─ gpt-5.4-mini            niyet ve varlık çıkarımı (anlama önbelleğiyle)
  │     ├─ gpt-4o-mini-transcribe  sesli mesaj → metin
  │     ├─ gpt-5.5 / standart model  yemek fotoğrafı ve besin etiketi okuma
  │     ├─ zxing-wasm              barkodu yapay zekâsız okuma (~50 ms)
  │     └─ web araştırması         veritabanında olmayan besini/hareketi bulup kataloğa ekleme
  ├─ training          11 antrenman/kardiyo programı, ilerleme motoru, rekorlar
  ├─ send-reminders    hatırlatmalar, Pazar raporu, yönetici özeti, dinlenme sayacı
  ├─ pdf-report        yemek planı ve aylık ilerleme raporu (PDF)
  ├─ public-api        Apple Sağlık (Kestirmeler) ile adım ve kilo aktarımı
  └─ ops               şifreli yedek, maliyet raporu, sağlık kontrolü, besin doğrulama, ödeme bildirimi
        │
        ▼
PostgreSQL (Supabase) ── 50+ tablo, RLS, CHECK kısıtları, pg_trgm + unaccent + pgvector arama
pg_cron            ── saatlik/haftalık hatırlatmalar, 10 sn'lik sayaç, 5 dk'lık sağlık kontrolü
n8n                ── yalnız yan işler: gece yedeği (Google Drive), yönetici e-postaları, ödeme bildirimi
GitHub Actions     ── main dalına gelen değişiklikte etkilenen edge function'ları otomatik dağıtır
```

## Özellikler

**Beslenme**
- Serbest Türkçe metinle öğün ve içecek kaydı; belirsiz öğünde soru sorma ("hangi peynir?"), kayıtlı öğünler, "her zamanki kahvaltım" ile alışkanlık öğünü, kişisel porsiyonlar ("1 kase pilav 250 gram"), düzenleme, silme ve yeni kaydı kısa süre içinde `geri al`
- **2.800+ kayıtlık besin veritabanı:** Türk mutfağı, USDA FoodData Central ham malzemeleri, 1.650+ barkodlu paketli ürün ve **650 zincir restoran ürünü** (McDonald's, Burger King, Popeyes, Starbucks, Tavuk Dünyası); "dilim", "kase", "kepçe" gibi porsiyonlar `food_portions` ile grama çevrilir
- **Kelime + anlam araması:** `pg_trgm` yazım hatalarını, `pgvector` (text-embedding-3-small) anlam benzerliğini yakalar ("ezo gelin" → Ezogelin çorbası); kalori her zaman veritabanından gelir, model yalnız adaylardan seçer
- **Otomatik besin doğrulama:** internetten araştırılan her besin Open Food Facts ve bağımsız ikinci bir araştırmayla karşılaştırılır; tutarsa kendiliğinden onaylanır, tutmazsa yöneticiye WhatsApp'ta iki seçenekle sorulur
- **Fotoğraftan tanıma:** tabak fotoğrafı → öğün; **barkod** → ürün; **paket üstündeki besin değerleri tablosu** → okunup kaydedilir
- Kayıtlarda besin değerinin kaynağını gösteren etiket; fotoğraf analizinde öğünün saati bağlam olarak kullanılır
- "Kaç kalori?" sorusunu kaydetmeden cevaplama, kalan hedefe göre **"ne yesem?"** önerileri

**Antrenman ve hareket**
- 11 hazır program: tüm vücut, evde dambıl, evde ekipmansız, GZCLP, Push-Pull-Legs 3/6 gün, Üst/Alt, **Koşuya Başla (0 → 5 km)**, 10K, yarı maraton, yüzme (0 → 1.500 m)
- **İlerleme motoru:** lineer ve çift ilerleme; 3 başarısızlıkta otomatik deload; her hareket için bir sonraki hedef ağırlık/tekrar; dinlenme sayacı
- 87 hareket için görselli Türkçe anlatım ve alternatif hareket önerisi; 1RM, plaka ve VKİ hesapları
- **Kardiyo:** kalori Compendium of Physical Activities MET değerleri ve ACSM denklemleriyle (hız + eğim); mesafe/tempo rekorları, haftalık 150 dk hedefi; adım takibi

**Takip ve raporlar**
- Su, kilo, vücut ölçüsü (ABD Donanması formülüyle yağ oranı) ve takviye kaydı; günlük özet, haftalık rapor
- Hedefleri değiştirmeyen "hafif gün" seçeneği; paylaşılabilir ilerleme kartı (kilo değişimi isteğe bağlı)
- Apple Sağlık'tan adım ve kilo aktarımı, 24 saatlik özel bağlantıyla web paneli
- Zayıflama iğnesi (GLP-1) takibi ve iğne günü hatırlatması

**Premium**
- Kilo trendi ve kayıtlara bakarak haftalık **akıllı kalori hedefi** ayarı
- Diyet tipine göre haftalık yemek planı, alışveriş listesi, PDF raporlar
- Akşam koç yorumu, aralıklı oruç zamanlayıcısı, ilerleme fotoğrafı karşılaştırması, kişisel hatırlatmalar

**Güvenlik ve sağlık**
- Kayıttan sonra sağlık soruları (hamilelik, emzirme, yeme bozukluğu geçmişi, şeker ilacı); riskli durumda kalori açığı ve uzun oruç kapalı
- Elle girilen kalori hedefi için alt sınırlar; elle hedef otomatik hesaplamalarda korunur, istenirse "hedeflerimi yeniden hesapla"; tek kalemde aşırı kaloride kaydetmeden onay

**Ürün ve işletim**
- Onboarding: WhatsApp Flows ile uygulama içi kayıt formu (form açılamazsa düz metne düşer), Mifflin-St Jeor ile TDEE; tek mesajda takviye, antrenman ve kardiyo bilgisi
- Free / Premium planlar, günlük limitler, 7 günlük deneme, ödeme bildiriminden otomatik Premium açma (HMAC imza doğrulaması)
- **Maliyet takibi:** her OpenAI çağrısı token ve dolar karşılığıyla kaydedilir; kullanıcı/gün bazında maliyet ve günlük e-posta raporu
- **Testler:** anlama 71/71, kalori 46/46 regresyon testi ve gerçek fonksiyona mesaj gönderen uçtan uca test koşucusu
- **İşletim:** AES-GCM ile şifrelenmiş gece yedeği, 5 dakikalık sağlık kontrolü, hata ve maliyet alarmları, haftalık yönetici raporu (kayıt hunisi, elde tutma)
- **KVKK:** açık onay akışı, aydınlatma metni, tek mesajla (`hesabımı sil`) tüm verilerin silinmesi; loglarda kişisel veri tutulmaz

## Veritabanı ve güvenlik

- Tüm tablolarda **Row Level Security**; her kullanıcı yalnızca kendi verisine erişir
- Değer aralıkları CHECK kısıtlarıyla veritabanı seviyesinde korunur
- `SECURITY DEFINER` fonksiyonlarının çalıştırma yetkisi istemci rollerinden kaldırılmıştır
- Meta webhook imzası (HMAC-SHA256) doğrulanır; WhatsApp mesaj kimliği üzerinden tekilleştirme; dahili fonksiyonlar yalnızca yetkili anahtarla çağrılabilir
- Kasım 2026 güvenlik denetimi ve düzeltmeleri: ödeme bildirimi eşleştirmesi, atomik sayaçlar, besin kataloğu bütünlüğü, acil durdurma anahtarı ve CI kontrolleri sıkılaştırıldı
- Tanıtım sitesinde yazı tipleri kendi sunucusundan sunulur (üçüncü taraf font isteği yok); panel sayfaları başka sitelerde çerçeve içine alınamaz

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
