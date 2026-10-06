# SporTakip AI 🏋️

WhatsApp üzerinden doğal dille çalışan, yapay zekâ destekli kişisel beslenme ve antrenman asistanı. Kullanıcı yazarak, sesli mesajla ya da yemeğinin fotoğrafını göndererek öğün, su, antrenman, kilo, vücut ölçüsü ve takviye kaydı tutar; ayrı bir uygulama indirmesine gerek yoktur.

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Deno](https://img.shields.io/badge/Deno-000000?style=flat-square&logo=deno&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3FCF8E?style=flat-square&logo=supabase&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![OpenAI](https://img.shields.io/badge/OpenAI-412991?style=flat-square&logo=openai&logoColor=white)
![WhatsApp](https://img.shields.io/badge/WhatsApp_Cloud_API-25D366?style=flat-square&logo=whatsapp&logoColor=white)
![n8n](https://img.shields.io/badge/n8n-EA4B71?style=flat-square&logo=n8n&logoColor=white)

## Ekran görüntüleri

<!-- WhatsApp sohbetinden 2-3 ekran görüntüsü ekleyin (telefon numaraları gizlenmiş olarak) -->

## Mimari

```
WhatsApp Cloud API
        │  webhook
        ▼
       n8n  ── orkestrasyon, mesaj tekilleştirme, zamanlanmış tetikleyiciler
        │
        ▼
Supabase Edge Functions (TypeScript / Deno)
  ├─ process-message   gelen her mesajı işler
  │     ├─ OpenAI gpt-4o-mini  → niyet ve varlık çıkarımı
  │     ├─ Whisper             → sesli mesaj → metin
  │     ├─ gpt-4o (vision)     → yemek fotoğrafı → öğün tahmini
  │     └─ web araması         → veritabanında olmayan besinleri bulup ekleme
  └─ send-reminders    zamanlanmış hatırlatma ve haftalık rapor
        │
        ▼
PostgreSQL (Supabase)  ── RLS, CHECK kısıtları, view'lar, trigram arama
```

## Tasarım ilkesi: "AI dili anlar, kod hesaplar"

LLM yalnızca kullanıcının **ne demek istediğini** anlamak için kullanılır: niyet sınıflandırması, besin adı, miktar ve birim çıkarımı. Kalori ve makro hesapları, porsiyon dönüşümleri ve hedef hesaplamaları **deterministik TypeScript ve SQL** katmanında yapılır. Böylece model halüsinasyonu hesaplara karışmaz ve aynı girdi her zaman aynı sonucu verir.

- Besin değerleri doğrulanmış yerel veritabanından gelir; "1 dilim", "1 su bardağı" gibi birimler `food_portions` tablosu üzerinden grama çevrilir.
- Fotoğraftan veya web araması sonucundan gelen değerler `confidence` alanıyla işaretlenir ve kullanıcıya "tahmini" olarak gösterilir.
- Günlük hedefler **Mifflin-St Jeor** denklemiyle hesaplanan TDEE'ye göre belirlenir.

## Özellikler

- **25+ niyet:** öğün, içecek, su, kilo, ölçü, takviye ve antrenman kaydı; düzenleme, silme, son öğünü tekrarlama; günlük özet, haftalık rapor, geçmiş sorgulama, hedef ve profil güncelleme
- **Çok modlu girdi:** yazı, sesli mesaj ve yemek fotoğrafı
- **Türkçe bulanık besin arama:** `unaccent` + `pg_trgm` ile yazım hatalarına dayanıklı, sıralaması ayarlanmış arama
- **Onboarding akışı:** yaş, boy, kilo, hedef ve aktivite seviyesine göre kişisel kalori ve makro hedefleri
- **Antrenman programı:** serbest metinle anlatılan programın LLM ile yapılandırılması ve günlük program hatırlatması
- **Hatırlatmalar:** eksik kahvaltı ve öğün, su hedefi, takviye, antrenman, tartılma; seri (streak) kutlamaları; Pazar akşamı haftalık rapor
- **Çok adımlı onay akışları:** silme işlemleri ve belirsiz öğün türü için zaman aşımlı bekleyen eylemler
- **Ürünleşme:** Free / Premium planlar, günlük mesaj, fotoğraf ve araştırma limitleri, davet koduyla erişim
- **Hesap silme:** kullanıcı talebiyle tüm verilerin kalıcı olarak silinmesi

## Veritabanı

13 tablo, 2 view ve yardımcı fonksiyonlardan oluşur. Şemanın tamamı [`supabase/schema.sql`](supabase/schema.sql) dosyasındadır.

| Grup | Tablolar |
|---|---|
| Kullanıcı | `profiles` |
| Besin | `foods`, `food_portions` |
| Beslenme | `meals`, `meal_items`, `water_logs`, `supplement_logs` |
| Vücut | `weight_logs`, `body_measurements` |
| Antrenman | `workout_sessions`, `workout_exercises`, `workout_programs` |
| Sistem | `message_logs` |

**Güvenlik:** Tüm tablolarda Row Level Security açıktır; her kullanıcı yalnızca kendi verisine erişebilir. Değer aralıkları CHECK kısıtlarıyla veritabanı seviyesinde korunur. `SECURITY DEFINER` fonksiyonlarının çalıştırma yetkisi istemci rollerinden kaldırılmıştır. Mesaj logları WhatsApp mesaj kimliği üzerinden tekilleştirilir.

## Proje yapısı

```
supabase/
├── functions/
│   ├── process-message/index.ts   # ana mesaj işleyici
│   └── send-reminders/index.ts    # zamanlanmış bildirimler
└── schema.sql                     # veritabanı şeması
.env.example                       # gerekli ortam değişkenleri
```

## Kurulum

```bash
# Şemayı uygula
supabase db push   # veya schema.sql'i SQL Editor'de çalıştır

# Gizli anahtarları tanımla (.env.example'a bakın)
supabase secrets set --env-file .env

# Fonksiyonları yayınla
supabase functions deploy process-message
supabase functions deploy send-reminders --no-verify-jwt
```

`send-reminders` JWT yerine `x-reminders-secret` header'ı ile korunur; `REMINDERS_SECRET` tanımlı değilse istekleri reddeder.

## Gizlilik

[Gizlilik politikası](https://github.com/ayberkfurkan1212/sportakip-privacy)

---

Geliştiren: [Ayberk Furkan Kaya](https://github.com/ayberkfurkan1212)
