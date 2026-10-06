import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("MY_SERVICE_ROLE_KEY")!;
const WHATSAPP_TOKEN = Deno.env.get("WHATSAPP_TOKEN")!;
const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")!;
const INVITE_CODE = Deno.env.get("INVITE_CODE")!;
const ADMIN_PHONE = Deno.env.get("ADMIN_PHONE") ?? "";

// İnternetten besin araştırma limitleri (günlük)
const FREE_RESEARCH_LIMIT = 3;
const PREMIUM_RESEARCH_LIMIT = 10;

interface MealItem {
  name: string;
  quantity: number;
  unit: string;
}

interface SupplementItem {
  name: string;
  amount?: string;
  category?: string;
}

interface WorkoutExercise {
  name: string;
  sets?: number;
  reps?: string;
  weight_kg?: number;
  duration_min?: number;
  notes?: string;
}

interface GoalUpdate {
  field: string;
  value: number;
}

interface ProgramExercise {
  name: string;
  sets?: number;
  reps?: string;
}

interface ProgramDay {
  day_number: number;
  day_label: string;
  exercises: ProgramExercise[];
}

interface ProfileUpdates {
  age?: number;
  height_cm?: number;
  gender?: string;
  activity_level?: string;
  goal_type?: string;
}

interface BodyMeasurements {
  waist_cm?: number;
  chest_cm?: number;
  arm_cm?: number;
}

interface AIResponse {
  intent: string;
  meal_type: string;
  amount_ml?: number;
  weight_kg?: number;
  supplements?: SupplementItem[];
  exercises?: WorkoutExercise[];
  session_type?: string;
  goal_updates?: GoalUpdate[];
  items: MealItem[];
  ambiguities: string[];
  date_range?: string;
  program?: ProgramDay[];
  profile_updates?: ProfileUpdates;
  measurements?: BodyMeasurements;
}

interface FoodRow {
  id: string;
  name: string;
  calories_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fat_per_100g: number;
}

interface ResearchResult {
  food: FoodRow;
  servingGrams: number | null;
}

interface ResolvedItem {
  item: MealItem;
  food: FoodRow;
  grams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  researched: boolean;
}

interface MealItemRow {
  id: string;
  meal_id: string;
  food_id: string | null;
  food_name_snapshot: string;
  quantity: number;
  unit: string | null;
  grams_resolved: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface MealWithItems {
  id: string;
  meal_type: string;
  created_at: string;
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fat: number;
  meal_items: MealItemRow[];
}

interface PendingMeal {
  items: MealItem[];
  source: "text" | "photo";
  local_date: string;
}

interface MacroTotals {
  cal: number;
  p: number;
  c: number;
  f: number;
}

type DeleteCategory = "meal" | "water" | "supplement" | "workout" | "weight" | "measurement";
type DeleteRange = "last" | "all";

interface DeleteCommand {
  kind: "day_reset" | "ambiguous" | "category" | "named";
  categories: DeleteCategory[];
  range: DeleteRange | null;
  mealType: string | null;
}

interface PendingAction {
  type: "delete_choice" | "reset_day";
  range?: DeleteRange;
}

const WELCOME_MESSAGE = `👋 Merhaba! Ben SporTakip — kişisel sağlık ve performans asistanınım.

Seninle birlikte şunları takip edebilirim:
🍽️ Beslenme & kalori/makro takibi
💧 Günlük su tüketimi
⚖️ Kilo takibi & trend analizi
🏋️‍♂️ Antrenman (set/tekrar/ağırlık)
💊 Supplement/takviye takibi
🥤 İçecek takibi

📖 Kaydın bittikten sonra istediğin zaman *komutlar* yazarak tüm komutları görebilirsin.

Başlamak için adını yazar mısın?`;

const HELP_MESSAGE = `📖 *SPORTAKİP KOMUTLARI*
Örnekleri birebir yazman gerekmiyor, kendi cümlelerinle de yazabilirsin.

🍽️ *Yemek*
• Kaydet: "2 yumurta yedim", "kahvaltıda 150 g peynir yedim"
• Fotoğraf: yemeğinin fotoğrafını gönder 📸
• Bugün ne yedim: "bugün ne yedim"
• Tek öğün: "kahvaltıda ne yedim", "akşam ne yedim"
• Düzelt: "yanlış girdim, aslında 3 yumurta yedim"
• Tekrar ekle: "dünkü kahvaltımı tekrar ekle"

🥤 *İçecek* (su hariç)
• Kaydet: "1 kutu kola içtim", "1 bardak ayran içtim"
• Liste: "bugün ne içtim"

💧 *Su*
• Kaydet: "500 ml su içtim", "2 bardak su içtim"
• Durum: "su durumum"

📊 *Raporlar*
• Günlük özet: "bugün"
• Haftalık rapor: "bu hafta"

⚖️ *Kilo ve ölçü*
• Kilo: "85 kg tartıldım" · Durum: "kilo durumum"
• Ölçü: "belim 85 cm" · Durum: "ölçülerim"

🏋️ *Antrenman*
• Kaydet: "bench press 4x8 80kg", "30 dk koşu yaptım"
• Geçmiş: "bugünkü antrenmanım", "bu hafta antrenmanlarım"
• Program: "programım: 1. gün push, bench press 4x8..."

💊 *Takviye*
• Kaydet: "kreatin içtim" · Liste: "takviyelerim"

🎯 *Hedef ve profil*
• Hedefler: "hedeflerim" · Değiştir: "kalori hedefimi 2800 yap"
• Profil: "profilim" · Güncelle: "yaşım 26 oldu", "artık çok aktifim"

🗑️ *Silme* (sadece bugünün kayıtları)
• "hamburgeri sil", "son öğünümü sil", "son içeceğimi sil"
• "son suyu sil", "bütün takviyeleri sil", "kilo kaydımı sil"
• Günü sıfırla: "bugünü sıfırla"

✨ *Üyelik ve hesap*
• "planım ne", "premium ol"
• Hesabı kapat: "hesabımı sil"

🎤 Yazmak yerine sesli mesaj da gönderebilirsin.`;

const UNKNOWN_REPLY = `🤔 Bunu anlayamadım.

Tüm komutları görmek için *komutlar* yaz.

Örnek: "2 yumurta yedim", "500 ml su içtim", "bugün"`;

function isHelpCommand(text: string): boolean {
  const t = normalizeChoice(text ?? "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!t || t.split(" ").length > 6) return false;
  return /komut/.test(t)
    || /^(yardim|help|menu|menü|kilavuz)( |$)/.test(t)
    || /(ne(ler)? yapabil|nasil kullan)/.test(t);
}

// ── İnternet araştırma limiti mesajı ─────────────────────
function researchLimitText(isPremium: boolean): string {
  if (isPremium) {
    return `🔍 Bugünkü internet araştırma hakkın doldu (günde ${PREMIUM_RESEARCH_LIMIT}). Yemeği daha genel bir isimle ya da gram olarak yazmayı dene (örn. "150 gram tavuk"). Hakkın yarın yenilenir.`;
  }
  return `🔍 Bugünkü internet araştırma hakkın doldu (günde ${FREE_RESEARCH_LIMIT}). Yemeği daha genel bir isimle ya da gram olarak yazmayı dene (örn. "150 gram tavuk"). Premium ile günde ${PREMIUM_RESEARCH_LIMIT} araştırma yapabilirsin: "premium ol" yaz.`;
}

const CHOICE_HINT = "\n\n(Numarasını ya da seçeneğin adını yazabilirsin.)";

const ONBOARDING_QUESTIONS = [
  "",
  "Harika {name}! Şimdi hedeflerini belirleyelim.\n\n💧 Günlük su hedefin kaç ml? (örn: 2500)",
  "🎂 Kaç yaşındasın?",
  "📏 Boyun kaç cm?",
  "⚧ Cinsiyetin?\n\n1️⃣ Erkek\n2️⃣ Kadın" + CHOICE_HINT,
  "⚖️ Şu anki kilon kaç kg?",
  "🏃 Aktivite seviyen nedir?\n\n1️⃣ Az hareketli (masa başı iş, egzersiz yok)\n2️⃣ Hafif aktif (haftada 1-3 gün egzersiz)\n3️⃣ Orta aktif (haftada 3-5 gün egzersiz)\n4️⃣ Çok aktif (haftada 6-7 gün egzersiz veya fiziksel iş)" + CHOICE_HINT,
  "🎯 Hedefin nedir?\n\n1️⃣ Kilo vermek\n2️⃣ Kiloyu korumak\n3️⃣ Kilo almak/kas yapmak\n4️⃣ Kiloyu koruyup kas kazanmak" + CHOICE_HINT,
  "💊 Kullandığın takviyeler var mı? Varsa yaz, yoksa 'yok' yaz.",
  "🏋️‍♂️ Antrenman programın nasıl? Kısaca anlat (örn: 'Haftada 4 gün push-pull-legs').",
  "🏃 Kardiyo yapıyor musun? Türü ve sıklığı nedir? (örn: 'Haftada 3 gün 30dk koşu, 8km/s'). Yapmıyorsan 'yok' yaz.",
];
const ONBOARDING_DONE_STEP = 11;

const GOAL_FIELD_MAP: Record<string, { column: string; label: string; unit: string }> = {
  calorie: { column: "calorie_goal", label: "Kalori hedefi", unit: "Kcal" },
  kalori: { column: "calorie_goal", label: "Kalori hedefi", unit: "Kcal" },
  protein: { column: "protein_goal", label: "Protein hedefi", unit: "g" },
  carbs: { column: "carbs_goal", label: "Karbonhidrat hedefi", unit: "g" },
  karbonhidrat: { column: "carbs_goal", label: "Karbonhidrat hedefi", unit: "g" },
  karb: { column: "carbs_goal", label: "Karbonhidrat hedefi", unit: "g" },
  fat: { column: "fat_goal", label: "Yağ hedefi", unit: "g" },
  yağ: { column: "fat_goal", label: "Yağ hedefi", unit: "g" },
  water: { column: "water_goal_ml", label: "Su hedefi", unit: "ml" },
  su: { column: "water_goal_ml", label: "Su hedefi", unit: "ml" },
};

const GOAL_FIELD_BOUNDS: Record<string, { min: number; max: number }> = {
  calorie_goal: { min: 800, max: 6000 },
  protein_goal: { min: 20, max: 400 },
  carbs_goal: { min: 0, max: 800 },
  fat_goal: { min: 10, max: 300 },
  water_goal_ml: { min: 500, max: 10000 },
};

const ACTIVITY_MAP: Record<string, { level: string; mult: number; label: string }> = {
  "1": { level: "sedanter", mult: 1.2, label: "Az hareketli" },
  "2": { level: "hafif_aktif", mult: 1.375, label: "Hafif aktif" },
  "3": { level: "orta_aktif", mult: 1.55, label: "Orta aktif" },
  "4": { level: "cok_aktif", mult: 1.725, label: "Çok aktif" },
  "sedanter": { level: "sedanter", mult: 1.2, label: "Az hareketli" },
  "hafif_aktif": { level: "hafif_aktif", mult: 1.375, label: "Hafif aktif" },
  "orta_aktif": { level: "orta_aktif", mult: 1.55, label: "Orta aktif" },
  "cok_aktif": { level: "cok_aktif", mult: 1.725, label: "Çok aktif" },
};

const GOAL_TYPE_LABELS: Record<string, string> = {
  kilo_verme: "Kilo verme",
  koruma: "Kiloyu koruma",
  kilo_alma: "Kilo alma",
  rekompozisyon: "Kiloyu koruyup kas kazanma",
};

// ── Seçim cevaplarını yorumlama (numara veya yazı) ────────
function normalizeChoice(text: string): string {
  return text
    .replace(/[\uFE0F\u20E3]/g, "")
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g")
    .replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/\s+/g, " ")
    .trim();
}

function leadingChoice(norm: string, max: number): number | null {
  const m = norm.match(/^(\d)(?!\d)/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return n >= 1 && n <= max ? n : null;
}

function parseGender(text: string): string | null {
  const t = normalizeChoice(text);
  const n = leadingChoice(t, 2);
  if (n === 1) return "male";
  if (n === 2) return "female";
  if (/\b(kadin|bayan|kiz|female|k)\b/.test(t)) return "female";
  if (/\b(erkek|bay|male|e)\b/.test(t)) return "male";
  return null;
}

function parseActivity(text: string): string | null {
  const t = normalizeChoice(text);
  const n = leadingChoice(t, 4);
  if (n) return String(n);
  if (/cok aktif|cok hareketli|fiziksel/.test(t)) return "4";
  if (/orta/.test(t)) return "3";
  if (/hafif/.test(t)) return "2";
  if (/az hareketli|az aktif|hareketsiz|sedanter|masa basi|egzersiz yok/.test(t)) return "1";
  return null;
}

function parseGoalType(text: string): string | null {
  const t = normalizeChoice(text);
  const byNumber: Record<number, string> = { 1: "kilo_verme", 2: "koruma", 3: "kilo_alma", 4: "rekompozisyon" };
  const n = leadingChoice(t, 4);
  if (n) return byNumber[n];
  if (/rekomp|recomp/.test(t) || (/koru/.test(t) && /kas/.test(t))) return "rekompozisyon";
  if (/ver|zayifla|yag yak|incel/.test(t)) return "kilo_verme";
  if (/kilo al|kas yap|kas kazan|bulk|hacim/.test(t)) return "kilo_alma";
  if (/koru|sabit/.test(t)) return "koruma";
  return null;
}

// ── Hesap silme ──────────────────────────────────────────
const DELETE_CONFIRM_WINDOW_MS = 10 * 60 * 1000; // 10 dakika

const DELETE_CONFIRM_REPLY = "⚠️ Hesabını silmek üzeresin.\n\nBu işlem geri alınamaz. Profilin, öğünlerin, su, kilo, vücut ölçüsü, takviye ve antrenman kayıtların, antrenman programın ve mesaj kayıtların kalıcı olarak silinecek.\n\nOnaylamak için 10 dakika içinde *SİL* yaz.\nVazgeçmek için \"vazgeç\" yazabilirsin.";
const DELETE_DONE_REPLY = "✅ Hesabın ve tüm verilerin silindi.\n\nSporTakip'i kullandığın için teşekkürler. İstediğin zaman tekrar yazarak sıfırdan başlayabilirsin (davet kodu gerekecek).";
const DELETE_CANCEL_REPLY = "👍 Hesap silme iptal edildi. Verilerin olduğu gibi duruyor.";
const DELETE_FAIL_REPLY = "⚠️ Hesabını silerken bir sorun oluştu, verilerin silinmedi. Lütfen biraz sonra tekrar dene.";

function isDeleteAccountCommand(text: string): boolean {
  const t = normalizeChoice(text);
  return /(hesabimi|hesabim|uyeligimi|kaydimi|verilerimi)\s+(tamamen\s+)?(sil|kapat)/.test(t)
    || /^hesap(imi)? sil/.test(t);
}

// AI delete_account döndürse bile, mesaj gerçekten hesaptan bahsetmiyorsa hesap silme akışı açılmaz
function looksLikeAccountRequest(text: string): boolean {
  const t = normalizeChoice(text);
  return /hesab|hesap|uyelig|uyelik|verilerimi|bilgilerimi|kaydimi|profilimi/.test(t);
}

function isCancelWord(text: string): boolean {
  const t = normalizeChoice(text);
  return /^(vazgec|vazgectim|iptal|hayir|silme|dur)\b/.test(t);
}

// ── Uygunsuz dil filtresi ──────────────────────────────────
// Not: ı -> i dönüşümü YAPILMAZ; böylece "sıkıntı", "sıktım" gibi kelimeler yakalanmaz.
// Kökler kelime sınırıyla ve belirli eklerle aranır (ör. "şikayet", "götür" yakalanmaz).
const TR_LETTERS = "a-zçğıöşü";
const PROFANITY_RE = new RegExp(
  `(^|[^${TR_LETTERS}])(` +
  `sik(tim|tin|ti|tir|tirin|tiriniz|er|erim|eyim|ecem|ecegim|eceğim|iş|is|ik|im|iyor|iyim)` +
  `|amk|amq|aq|amına|amina|amcık|amcik` +
  `|orospu[${TR_LETTERS}]*|oç|piç[${TR_LETTERS}]*` +
  `|yarr?ak[${TR_LETTERS}]*|yarrağ[${TR_LETTERS}]*` +
  `|göt|götveren|götün|ibne[${TR_LETTERS}]*|pezevenk[${TR_LETTERS}]*` +
  `|kahpe[${TR_LETTERS}]*|yavşak[${TR_LETTERS}]*|şerefsiz[${TR_LETTERS}]*` +
  `)(?![${TR_LETTERS}])`
);

function isProfane(text: string): boolean {
  return PROFANITY_RE.test(text.toLocaleLowerCase("tr-TR"));
}

const PROFANITY_REPLY = "🙏 Lütfen saygılı bir dil kullanalım. Ben beslenme, su, kilo, antrenman ve takviye takibinde sana yardımcı olmak için buradayım.";

// ── Takviye doğrulama ──────────────────────────────────────
const VALID_SUPPLEMENT_CATEGORIES = ["vitamin", "mineral", "sports", "herbal", "other_supplement"];
const MAX_SUPPLEMENT_COUNT = 10;   // tek seferde kapsül/tablet/adet/ölçek
const MAX_SUPPLEMENT_GRAMS = 200;  // tek seferde toz takviye (gram)

const SUPPLEMENT_CATEGORY_GUIDE = `Her takviyeye bir "category" ata:
- vitamin: D vitamini, C vitamini, B12, multivitamin vb.
- mineral: magnezyum, çinko, demir, kalsiyum vb.
- sports: kreatin, whey/protein tozu, BCAA, glutamin, pre-workout, kafein tableti, L-karnitin vb.
- herbal: ashwagandha, zerdeçal, ginseng, yeşil çay ekstresi vb.
- other_supplement: omega-3/balık yağı, probiyotik, kolajen, melatonin, koenzim Q10 vb.
- medication: reçeteli veya reçetesiz ilaçlar (ör. viagra, antibiyotik, ağrı kesici, antidepresan, tansiyon ilacı)
- invalid: gerçek bir besin takviyesi olmayan, anlamsız, şaka amaçlı veya uygunsuz her şey
Kullanıcı "takviye olarak" dese bile gerçek bir takviye değilse category'yi invalid yap. İsimleri düzeltme veya uydurma, kullanıcının yazdığı gibi aktar.`;

function supplementRejectReason(s: SupplementItem): string | null {
  const cat = String(s.category ?? "").toLowerCase().trim();
  if (cat === "medication") return "ilaç, takviye değil";
  if (!VALID_SUPPLEMENT_CATEGORIES.includes(cat)) return "takviye olarak tanımadım";

  const amt = normalizeChoice(String(s.amount ?? ""));
  const m = amt.match(/(\d+(?:[.,]\d+)?)\s*(kapsul|tablet|adet|tane|olcek|scoop|softgel|gram|gr|g)?\b/);
  if (m && m[2]) {
    const n = parseFloat(m[1].replace(",", "."));
    const u = m[2];
    if (["gram", "gr", "g"].includes(u) && n > MAX_SUPPLEMENT_GRAMS) return "miktar gerçekçi değil";
    if (!["gram", "gr", "g"].includes(u) && n > MAX_SUPPLEMENT_COUNT) return "miktar gerçekçi değil";
  }
  return null;
}

function supplementRejectReply(rejected: string[]): string {
  return `⚠️ Bunu takviye olarak kaydedemedim.\n\n${rejected.map((r) => `• ${r}`).join("\n")}\n\nVitamin, mineral, protein tozu, kreatin, omega-3 gibi besin takviyelerini kaydedebilirim. Örn: "kreatin içtim", "2 kapsül omega 3 aldım"`;
}

// ── Öğün tipleri ─────────────────────────────────────────
const MEAL_TYPE_LABELS: Record<string, string> = {
  breakfast: "Kahvaltı",
  lunch: "Öğle Yemeği",
  dinner: "Akşam Yemeği",
  snack: "Atıştırmalık",
  drink: "İçecekler",
};
const MEAL_TYPE_ICONS: Record<string, string> = {
  breakfast: "🍳",
  lunch: "🍗",
  dinner: "🍽️",
  snack: "🥨",
  drink: "🥤",
};
const MEAL_TYPE_ORDER = ["breakfast", "lunch", "dinner", "snack", "drink"];

function resolveMealType(raw: unknown): string | null {
  const t = normalizeChoice(String(raw ?? ""));
  if (!t) return null;
  if (MEAL_TYPE_ORDER.includes(t)) return t;
  if (/kahvalti|sabah/.test(t)) return "breakfast";
  if (/ogle/.test(t)) return "lunch";
  if (/aksam/.test(t)) return "dinner";
  if (/ara ogun|atistir|cerez|snack/.test(t)) return "snack";
  if (/icece|drink/.test(t)) return "drink";
  return null;
}

// ── Öğün tipi sorusu ─────────────────────────────────────
const MEAL_TYPE_QUESTION = "Bu hangi öğün?\n\n1️⃣ Kahvaltı\n2️⃣ Öğle yemeği\n3️⃣ Akşam yemeği\n4️⃣ Atıştırmalık" + CHOICE_HINT;
const MEAL_TYPE_BY_NUMBER: Record<string, string> = { "1": "breakfast", "2": "lunch", "3": "dinner", "4": "snack" };

// Sadece kısa ve net bir seçim cevabını kabul eder ("2 yumurta yedim" gibi yeni mesajları seçim sanmaz)
function parseMealTypeChoice(text: string): string | null {
  const t = normalizeChoice(text).replace(/[.!)]+$/, "").trim();
  const num = t.match(/^([1-4])$/);
  if (num) return MEAL_TYPE_BY_NUMBER[num[1]];
  if (/\d/.test(t) || t.split(" ").length > 3) return null;
  return resolveMealType(t);
}

// ── Silme komutları: sabit kural tablosu ──────────────────────
// "sil", "kaldır", "sıfırla", "iptal et" geçen mesajlar AI'a gitmeden burada çözülür.
// Kapsam: sadece BUGÜNÜN kayıtları. Belirsizse hiçbir şey silinmez, kullanıcıya sorulur.
const PENDING_ACTION_WINDOW_MS = 10 * 60 * 1000;

const DELETE_VERB_RE = /\s(sil|silin|silsene|silelim|silebilir|silebilirmisin|silmek|silsin|siler|silermisin|kaldir|kaldirin|kaldirsana|kaldiralim|sifirla|sifirlar|sifirlayalim|sifirlayin|sifirlarmisin|iptal et|iptal etsene|iptal edin)\s/;

const DELETE_CATEGORY_PATTERNS: [DeleteCategory, RegExp][] = [
  ["meal", /(yemek|ogun|kahvalti|ogle|aksam|atistirma|yedig|yedik|icece|ictig)/],
  ["water", /(^|\s)(su|suyu|suyumu|sulari|sularimi|suyun)(\s|$)/],
  ["supplement", /(takviye|supplement)/],
  ["workout", /(antrenman|egzersiz|idman)/],
  ["weight", /(^|\s)(kilo|kilomu|kiloyu|kilom|tarti)/],
  ["measurement", /(olcu|olcum)/],
];

const DELETE_FILLER_EXACT = new Set([
  "sil", "silin", "silsene", "silelim", "silebilir", "silebilirmisin", "silmek", "silsin", "siler", "silermisin",
  "kaldir", "kaldirin", "kaldirsana", "kaldiralim", "sifirla", "sifirlar", "sifirlayalim", "sifirlayin", "sifirlarmisin",
  "iptal", "et", "etsene", "edin", "misin", "mi", "mu", "istiyorum", "lutfen", "benim", "bir", "ve", "de", "da", "ile",
  "icin", "olarak", "tane", "adet", "porsiyon", "gram", "gr", "g", "kg", "ml", "lt", "litre", "bardak", "sise", "kapsul",
  "tablet", "olcek", "bugun", "bugunku", "bugunun", "bugunu", "gun", "gunu", "gunun", "son", "sonuncu", "en", "ne",
  "varsa", "hepsi", "hepsini", "tum", "tumu", "tumunu", "butun", "tamami", "tamamini", "her", "sey", "seyi", "hersey",
  "herseyi", "ara", "su", "suyu", "suyumu", "sulari", "sularimi", "suyun", "kilo", "kilomu", "kiloyu", "kilom", "tarti",
]);
const DELETE_FILLER_PREFIX = [
  "ogun", "kahvalti", "ogle", "aksam", "yemek", "yedig", "yedik", "yedim", "atistir", "takviye", "supplement",
  "antrenman", "egzersiz", "idman", "olcu", "olcum", "kayd", "kayit", "icece", "ictig", "ictim",
];

function deleteLeftoverTokens(t: string): string[] {
  return t.split(/\s+/).filter((w) =>
    w &&
    !/^\d+([.,]\d+)?$/.test(w) &&
    !DELETE_FILLER_EXACT.has(w) &&
    !DELETE_FILLER_PREFIX.some((p) => w.startsWith(p))
  );
}

function parseDeleteCommand(text: string): DeleteCommand | null {
  const t = normalizeChoice(text).replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!DELETE_VERB_RE.test(` ${t} `)) return null;

  const isAll = /(^|\s)(butun|tum|tumu|tumunu|hepsi|hepsini|tamami|tamamini)(\s|$)/.test(t)
    || /(^|\s)(yemekleri|yemeklerimi|ogunleri|ogunlerimi|sulari|sularimi|takviyeleri|takviyelerimi|egzersizleri|egzersizlerimi|antrenmanlari|kayitlari|kayitlarimi)(\s|$)/.test(t);
  const isLast = /(^|\s)(son|sonuncu)(\s|$)/.test(t);

  const categories: DeleteCategory[] = [];
  for (const [cat, re] of DELETE_CATEGORY_PATTERNS) {
    if (cat === "weight" && /\d+\s*(kilo|kg)/.test(t)) continue; // "1 kilo peyniri sil" kilo kaydı değil
    if (re.test(t)) categories.push(cat);
  }
  const mealType = categories.includes("meal") ? resolveMealType(t) : null;
  const leftovers = deleteLeftoverTokens(t);

  // "bugünü sıfırla", "bugünkü her şeyi sil"
  if (categories.length === 0 && leftovers.length === 0 &&
      (/(^|\s)sifirla/.test(t) || (/her ?sey/.test(t) && /bugun/.test(t)))) {
    return { kind: "day_reset", categories, range: "all", mealType: null };
  }
  // "hamburgeri sil", "kreatini sil", "bench pressi sil"
  if (leftovers.length > 0) {
    return { kind: "named", categories, range: null, mealType };
  }
  // "sil", "hepsini sil", "son kaydı sil", "bütün kayıtları sil"
  if (categories.length === 0) {
    return { kind: "ambiguous", categories, range: isAll ? "all" : "last", mealType: null };
  }

  let range: DeleteRange | null = isAll ? "all" : isLast ? "last" : null;
  // "bugünkü antrenmanı sil" = o günün tüm antrenmanı; "egzersizi sil" = son egzersiz
  if (!range && categories.includes("workout") && /(antrenman|idman)/.test(t)) range = "all";
  return { kind: "category", categories, range, mealType };
}

function parseDeleteChoice(text: string): DeleteCategory | "day" | null {
  const t = normalizeChoice(text).replace(/[.!)]+$/, "").trim();
  const byNumber: Record<string, DeleteCategory | "day"> = {
    "1": "meal", "2": "water", "3": "supplement", "4": "workout", "5": "weight", "6": "day",
  };
  const num = t.match(/^([1-6])$/);
  if (num) return byNumber[num[1]];
  if (t.split(" ").length > 3) return null;
  if (/yemek|ogun/.test(t)) return "meal";
  if (/^(su|suyu|sular|sulari)$/.test(t)) return "water";
  if (/takviye/.test(t)) return "supplement";
  if (/antrenman|egzersiz|idman/.test(t)) return "workout";
  if (/kilo|tarti/.test(t)) return "weight";
  if (/bugun|hepsi|tamami|her ?sey/.test(t)) return "day";
  return null;
}

const DELETE_ABORT_REPLY = "👍 Vazgeçildi, hiçbir kayıt silinmedi.";

const DAY_RESET_CONFIRM_REPLY = "⚠️ Bugünkü TÜM kayıtların silinecek: öğünler, su, takviyeler, antrenman, kilo ve ölçüler. Bu işlem geri alınamaz.\n\nOnaylamak için 10 dakika içinde *EVET* yaz.\nVazgeçmek için \"vazgeç\" yazabilirsin.";

// ── Gerçekçilik sınırları ──────────────────────────────────
const MAX_ITEM_GRAMS = 2000;     // tek kalem: en fazla 2 kg
const MAX_ITEM_COUNT = 30;       // tek kalem: en fazla 30 adet/dilim/kaşık vb.
const MAX_MEAL_CALORIES = 6000;  // tek öğün: en fazla 6000 Kcal

function isGramUnit(u: string): boolean {
  return ["gram", "gr", "g"].includes(u);
}
function isKgUnit(u: string): boolean {
  return ["kg", "kilo", "kilogram"].includes(u);
}
function isMlUnit(u: string): boolean {
  return ["ml", "mililitre", "mlt", "cc"].includes(u);
}
function isLiterUnit(u: string): boolean {
  return ["l", "lt", "litre", "liter"].includes(u);
}
function normUnit(u: unknown): string {
  const n = normalizeChoice(String(u ?? ""));
  if (["tane", "adet", "ad"].includes(n)) return "adet";
  if (isGramUnit(n)) return "gram";
  return n;
}

function unrealisticReply(lines: string[]): string {
  return `⚠️ Bu miktar gerçekçi görünmüyor, öğünü kaydetmedim.\n\n${lines.map((l) => `• ${l}`).join("\n")}\n\nTek kalemde en fazla 2 kg ya da 30 adet, tek öğünde en fazla 6000 Kcal kaydedebiliyorum. Miktarı kontrol edip tekrar yazar mısın?`;
}

// İnternet araştırmasından (ve öğün sorusundan) önce hızlı miktar kontrolü
function quickQuantityCheck(items: MealItem[]): string | null {
  const tooMuch: string[] = [];
  for (const item of items) {
    const q = Number(item.quantity) || 1;
    const u = normalizeChoice(String(item.unit ?? ""));
    if (isGramUnit(u)) {
      if (q > MAX_ITEM_GRAMS) tooMuch.push(`${item.name}: ${q} g`);
    } else if (isKgUnit(u)) {
      if (q * 1000 > MAX_ITEM_GRAMS) tooMuch.push(`${item.name}: ${q} kg`);
    } else if (isMlUnit(u)) {
      if (q > MAX_ITEM_GRAMS) tooMuch.push(`${item.name}: ${q} ml`);
    } else if (isLiterUnit(u)) {
      if (q * 1000 > MAX_ITEM_GRAMS) tooMuch.push(`${item.name}: ${q} litre`);
    } else if (q > MAX_ITEM_COUNT) {
      tooMuch.push(`${item.name}: ${q} ${item.unit ?? ""}`.trim());
    }
  }
  return tooMuch.length > 0 ? unrealisticReply(tooMuch) : null;
}

// ── Biçimlendirme yardımcıları ───────────────────────────
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function formatQty(quantity: unknown, unit: unknown): string {
  const q = Number(quantity);
  const u = String(unit ?? "").trim();
  if (!q) return "";
  return `${round1(q)}${u ? " " + u : ""}`;
}

function formatItemLine(name: string, quantity: unknown, unit: unknown, calories: number, protein: unknown = null, researched = false): string {
  const qty = formatQty(quantity, unit);
  const p = Number(protein);
  const pText = protein === null || protein === undefined || Number.isNaN(p) ? "" : ` · ${round1(p)} g protein`;
  return `• ${name}${qty ? ` (${qty})` : ""} — ${Math.round(calories)} Kcal${pText}${researched ? " 🔍" : ""}`;
}

function remainingText(label: string, goal: number, current: number, unit: string): string {
  const diff = goal - current;
  const fmt = (v: number) => unit === "Kcal" ? Math.round(v) : round1(v);
  return diff >= 0
    ? `${label}: ${fmt(diff)} ${unit}`
    : `${label}: hedefi ${fmt(-diff)} ${unit} aştın`;
}

function sumMeals(meals: { total_calories: number; total_protein: number; total_carbs?: number; total_fat?: number }[]): MacroTotals {
  return {
    cal: meals.reduce((s, m) => s + Number(m.total_calories || 0), 0),
    p: meals.reduce((s, m) => s + Number(m.total_protein || 0), 0),
    c: meals.reduce((s, m) => s + Number(m.total_carbs || 0), 0),
    f: meals.reduce((s, m) => s + Number(m.total_fat || 0), 0),
  };
}

function macroLine(t: MacroTotals): string {
  return `🔥 ${Math.round(t.cal)} Kcal | Protein: ${round1(t.p)} g | Karb: ${round1(t.c)} g | Yağ: ${round1(t.f)} g`;
}

function nameMatches(stored: string, targetNorm: string): boolean {
  const sn = normalizeChoice(stored ?? "");
  return targetNorm.length >= 3 && sn.length >= 3 && (sn.includes(targetNorm) || targetNorm.includes(sn));
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const body = await req.json();
    console.log("Incoming body:", JSON.stringify(body));
    const { phone, user_id, message_text, media_id, media_type } = body;

    if ((!phone && !user_id) || (!message_text && !media_id)) {
      return Response.json({ error: "phone (veya user_id) ve (message_text veya media_id) zorunlu" }, { status: 400 });
    }

    let finalMessageText = message_text;
    if (media_id && media_type === "audio" && !finalMessageText) {
      const transcribed = await transcribeVoiceMessage(media_id);
      if (!transcribed) {
        return Response.json({ reply: "🎤 Sesli mesajını anlayamadım, tekrar dener misin? Ya da yazarak gönderebilirsin." });
      }
      finalMessageText = transcribed;
    }

    const profile = user_id
      ? await getProfileById(supabase, user_id)
      : await findOrCreateProfileByPhone(supabase, phone);

    if (!profile) {
      return Response.json({ reply: "Bir sorun oluştu, lütfen tekrar dene." });
    }

    // ── Uygunsuz dil: mesaj hiç işlenmez ──
    if (finalMessageText && isProfane(finalMessageText)) {
      console.warn(`Uygunsuz dil engellendi (user ${profile.id})`);
      return Response.json({ reply: PROFANITY_REPLY });
    }

    // ── Hesap silme akışı (onboarding dahil her aşamada çalışır) ──
    if (finalMessageText) {
      const requestedAt = profile.delete_requested_at
        ? new Date(profile.delete_requested_at as string).getTime()
        : 0;
      const pendingActive = requestedAt > 0 && (Date.now() - requestedAt) < DELETE_CONFIRM_WINDOW_MS;

      if (pendingActive) {
        if (normalizeChoice(finalMessageText) === "sil") {
          const ok = await deleteAccount(supabase, profile);
          return Response.json({ reply: ok ? DELETE_DONE_REPLY : DELETE_FAIL_REPLY });
        }
        // Onay gelmedi: bekleyen talebi iptal et
        await supabase.from("profiles").update({ delete_requested_at: null }).eq("id", profile.id);
        profile.delete_requested_at = null;
        if (isCancelWord(finalMessageText)) {
          return Response.json({ reply: DELETE_CANCEL_REPLY });
        }
        // Başka bir mesajsa talep sessizce düşer, mesaj normal işlenir
      }

      if (isDeleteAccountCommand(finalMessageText)) {
        return Response.json({ reply: await requestAccountDeletion(supabase, profile) });
      }
    }

    let step = profile.onboarding_step as number;

    if (media_id && media_type === "image" && step < ONBOARDING_DONE_STEP) {
      return Response.json({ reply: "📸 Fotoğraf özelliğini kullanmadan önce kaydını tamamlaman gerekiyor. Lütfen soruları yazarak cevapla." });
    }

    if (step === -2) {
      if (finalMessageText.trim() === INVITE_CODE) {
        await supabase.from("profiles").update({ onboarding_step: -1 }).eq("id", profile.id);
        step = -1;
      } else {
        return Response.json({ reply: "🔒 Bu bot davetiye ile çalışıyor.\n\nDevam etmek için davet kodunu gönder." });
      }
    }

    if (step === -1) {
      await supabase.from("profiles").update({ onboarding_step: 0 }).eq("id", profile.id);
      return Response.json({ reply: WELCOME_MESSAGE, onboarding: "started" });
    }

    // ── "komutlar", "yardım": her zaman komut listesini göster ──
    if (finalMessageText && isHelpCommand(finalMessageText)) {
      if (step >= 0 && step < ONBOARDING_DONE_STEP) {
        const q = step === 0
          ? "Adını yazar mısın?"
          : ONBOARDING_QUESTIONS[step].replace("{name}", String(profile.full_name ?? ""));
        return Response.json({ reply: `${HELP_MESSAGE}\n\n━━━━━━━━━━\n📝 Komutları kullanmak için önce kaydını tamamlayalım:\n\n${q}` });
      }
      if (step >= ONBOARDING_DONE_STEP) return Response.json({ reply: HELP_MESSAGE });
    }

    if (step < ONBOARDING_DONE_STEP) {
      const { reply, justFinished } = await handleOnboarding(supabase, profile, finalMessageText);
      return Response.json({ reply, onboarding: !justFinished ? "in_progress" : "completed" });
    }

    if (ADMIN_PHONE && profile.phone_e164 === ADMIN_PHONE) {
      const adminMatch = finalMessageText?.trim().match(/^premium yap\s+(\+?\d{10,15})(?:\s+(\d+))?$/i);
      if (adminMatch) {
        const targetPhone = adminMatch[1].startsWith("+") ? adminMatch[1] : `+${adminMatch[1]}`;
        const days = adminMatch[2] ? parseInt(adminMatch[2], 10) : 30;
        const until = new Date();
        until.setDate(until.getDate() + days);
        const untilStr = until.toISOString().split("T")[0];
        const { data: targetProfile } = await supabase.from("profiles").select("id").eq("phone_e164", targetPhone).maybeSingle();
        if (!targetProfile) {
          return Response.json({ reply: `⚠️ ${targetPhone} numaralı kullanıcı bulunamadı.` });
        }
        await supabase.from("profiles").update({ plan: "premium", premium_until: untilStr }).eq("id", targetProfile.id);
        return Response.json({ reply: `✅ ${targetPhone} premium yapıldı (${untilStr} tarihine kadar).` });
      }
    }

    const today = getLocalDate();
    const userIsPremium = isPremiumActive(profile);
    const dailyMessageLimit = userIsPremium ? 300 : 45;

    const lastMessageDate = profile.daily_message_date as string | null;
    let messageCount = (profile.daily_message_count as number) ?? 0;

    if (lastMessageDate !== today) {
      messageCount = 0;
    }
    messageCount += 1;

    if (messageCount > dailyMessageLimit) {
      return Response.json({ reply: userIsPremium
        ? "🚫 Günlük kullanım hakkınız dolmuştur.\n\nYarın tekrar deneyebilirsin."
        : "🚫 Günlük kullanım hakkınız dolmuştur.\n\nYarın tekrar deneyebilirsin, ya da sınırsız kullanım için \"premium ol\" yazabilirsin." });
    }

    await supabase.from("profiles").update({
      daily_message_count: messageCount,
      daily_message_date: today,
    }).eq("id", profile.id);

    if (!userIsPremium && messageCount === 40 && profile.phone_e164) {
      await sendWhatsAppMessage(profile.phone_e164 as string, "⚠️ Bugün için 40 mesaj gönderdin, günlük limitin 45. Limit dolunca yarına kadar bot cevap veremeyecek. Sınırsız kullanım için \"premium ol\" yazabilirsin.");
    }

    // ── Bekleyen silme işlemi (seçim veya EVET onayı) ──
    const pendingAction = profile.pending_action as PendingAction | null;
    if (pendingAction) {
      const at = profile.pending_action_at ? new Date(profile.pending_action_at as string).getTime() : 0;
      await clearPendingAction(supabase, profile.id as string);
      if (finalMessageText && Date.now() - at < PENDING_ACTION_WINDOW_MS) {
        if (pendingAction.type === "reset_day") {
          if (normalizeChoice(finalMessageText) === "evet") {
            return Response.json({ reply: await resetDay(supabase, profile) });
          }
          if (isCancelWord(finalMessageText)) return Response.json({ reply: DELETE_ABORT_REPLY });
        } else if (pendingAction.type === "delete_choice") {
          const choice = parseDeleteChoice(finalMessageText);
          if (choice === "day") {
            return Response.json({ reply: await requestDayReset(supabase, profile.id as string) });
          }
          if (choice) {
            return Response.json({ reply: await deleteCategory(supabase, profile, choice, pendingAction.range ?? "last", null) });
          }
          if (isCancelWord(finalMessageText)) return Response.json({ reply: DELETE_ABORT_REPLY });
        }
        // Başka bir mesaj geldi: bekleyen işlem düşer, mesaj normal işlenir
      }
    }

    // ── Öğün tipi sorusu bekleniyor mu? ──
    const pending = profile.pending_meal as PendingMeal | null;
    if (pending && Array.isArray(pending.items) && pending.items.length > 0) {
      const isPhoto = !!(media_id && media_type === "image");
      const choice = (!isPhoto && finalMessageText) ? parseMealTypeChoice(finalMessageText) : null;
      await clearPendingMeal(supabase, profile.id as string);

      if (choice) {
        return Response.json({ reply: await finalizePendingMeal(supabase, profile, pending, choice) });
      }

      // Kullanıcı seçim yapmadan başka bir şey yazdı: kaydı kaybetme, mesajın atıldığı saate göre kaydet
      const pendingAt = profile.pending_meal_at ? new Date(profile.pending_meal_at as string) : new Date();
      const autoType = mealTypeForHour(istanbulHour(pendingAt));
      const autoReply = await finalizePendingMeal(supabase, profile, pending, autoType);
      if (profile.phone_e164) {
        await sendWhatsAppMessage(
          profile.phone_e164 as string,
          `ℹ️ Önceki kaydın hangi öğün olduğunu seçmediğin için saate göre ${MEAL_TYPE_LABELS[autoType]} olarak kaydettim. Değiştirmek istersen silip tekrar ekleyebilirsin.\n\n${autoReply}`,
        );
      }
      // Yeni mesaj aşağıda normal şekilde işlenmeye devam eder
    }

    // ── Fotoğraf: yiyecekleri tanı, öğün tipini sor ──
    if (media_id && media_type === "image") {
      const photoLimit = userIsPremium ? Infinity : 3;
      let photoCount = (profile.daily_photo_date === today) ? ((profile.daily_photo_count as number) ?? 0) : 0;
      photoCount += 1;
      if (photoCount > photoLimit) {
        return Response.json({ reply: `📸 Bugünkü ücretsiz fotoğraf tanıma hakkın (${photoLimit}) doldu. Sınırsız fotoğraf tanıma için "premium ol" yazabilirsin.` });
      }
      await supabase.from("profiles").update({ daily_photo_count: photoCount, daily_photo_date: today }).eq("id", profile.id);

      if (profile.phone_e164) {
        await sendWhatsAppMessage(profile.phone_e164 as string, "📸 Fotoğrafını inceliyorum, birazdan sonucu göndereceğim...");
      }
      const items = await analyzeFoodImage(media_id);
      if (!items || items.length === 0) {
        return Response.json({ reply: "📸 Fotoğraftaki yemeği net olarak tanıyamadım. Yakından, net bir fotoğrafla tekrar dener misin? Ya da yazarak ekleyebilirsin, örn. '2 yumurta yedim'" });
      }
      const tooMuch = quickQuantityCheck(items);
      if (tooMuch) return Response.json({ reply: tooMuch });

      await savePendingMeal(supabase, profile.id as string, items, "photo");
      return Response.json({ reply: askMealTypeReply(items, "photo") });
    }

    // ── Silme komutları: sabit kural tablosu (AI tahmini yok) ──
    const deleteCmd = finalMessageText ? parseDeleteCommand(finalMessageText) : null;
    if (deleteCmd) {
      console.log("Delete command:", JSON.stringify(deleteCmd));
      return Response.json({ reply: await executeDeleteCommand(supabase, profile, deleteCmd, finalMessageText) });
    }

    const aiResult = await parseWithAI(finalMessageText);

    if (aiResult.intent === "log_meal") {
      const items = (aiResult.items ?? []).filter((i) => i && i.name);
      if (items.length === 0) {
        return Response.json({ reply: "Ne yediğini anlayamadım. Örn: '2 yumurta yedim' veya '150 gram tavuk yedim'" });
      }
      // Kullanıcı öğünü söylediyse direkt kaydet, söylemediyse sor
      const explicitType = resolveMealType(aiResult.meal_type);
      if (explicitType) {
        return Response.json({ reply: await handleLogMeal(supabase, profile, aiResult, explicitType) });
      }
      const tooMuch = quickQuantityCheck(items);
      if (tooMuch) return Response.json({ reply: tooMuch });

      await savePendingMeal(supabase, profile.id as string, items, "text");
      return Response.json({ reply: askMealTypeReply(items, "text") });
    }
    if (aiResult.intent === "delete_meal") {
      return Response.json({ reply: await handleDeleteMeal(supabase, profile, aiResult) });
    }
    if (aiResult.intent === "delete_day_meals") {
      return Response.json({ reply: await handleDeleteDayMeals(supabase, profile) });
    }
    if (aiResult.intent === "edit_meal") {
      return Response.json({ reply: await handleEditMeal(supabase, profile, aiResult) });
    }
    if (aiResult.intent === "daily_summary") {
      return Response.json({ reply: await handleDailySummary(supabase, profile) });
    }
    if (aiResult.intent === "meal_history") {
      return Response.json({ reply: await handleMealHistory(supabase, profile, aiResult) });
    }
    if (aiResult.intent === "log_water" && !isPlainWater(finalMessageText)) {
      // AI su dese bile mesajda düz su yoksa (kola, ayran, meyve suyu...) içecek olarak kaydet
      const drinkItems = await parseDrinkItems(finalMessageText);
      if (drinkItems.length > 0) {
        aiResult.intent = "log_drink";
        aiResult.items = drinkItems;
        aiResult.amount_ml = 0;
      }
    }
    if (aiResult.intent === "log_drink") {
      return Response.json({ reply: await handleLogDrink(supabase, profile, aiResult) });
    }
    if (aiResult.intent === "log_water") {
      return Response.json({ reply: await handleLogWater(supabase, profile, aiResult) });
    }
    if (aiResult.intent === "water_summary") {
      return Response.json({ reply: await handleWaterSummary(supabase, profile) });
    }
    if (aiResult.intent === "log_weight") {
      return Response.json({ reply: await handleLogWeight(supabase, profile, aiResult) });
    }
    if (aiResult.intent === "weight_status") {
      return Response.json({ reply: await handleWeightStatus(supabase, profile) });
    }
    if (aiResult.intent === "log_supplement") {
      return Response.json({ reply: await handleLogSupplement(supabase, profile, aiResult) });
    }
    if (aiResult.intent === "supplement_status") {
      return Response.json({ reply: await handleSupplementStatus(supabase, profile) });
    }
    if (aiResult.intent === "log_workout") {
      return Response.json({ reply: await handleLogWorkout(supabase, profile, aiResult) });
    }
    if (aiResult.intent === "workout_history") {
      return Response.json({ reply: await handleWorkoutHistory(supabase, profile, aiResult.date_range || "today") });
    }
    if (aiResult.intent === "delete_last_exercise") {
      return Response.json({ reply: await handleDeleteLastExercise(supabase, profile) });
    }
    if (aiResult.intent === "delete_last_water") {
      return Response.json({ reply: await handleDeleteLastWater(supabase, profile) });
    }
    if (aiResult.intent === "delete_last_weight") {
      return Response.json({ reply: await handleDeleteLastWeight(supabase, profile) });
    }
    if (aiResult.intent === "set_program") {
      return Response.json({ reply: await handleSetProgram(supabase, profile, aiResult) });
    }
    if (aiResult.intent === "update_profile") {
      return Response.json({ reply: await handleUpdateProfile(supabase, profile, aiResult) });
    }
    if (aiResult.intent === "show_profile") {
      return Response.json({ reply: await handleShowProfile(supabase, profile) });
    }
    if (aiResult.intent === "update_goal") {
      return Response.json({ reply: await handleUpdateGoal(supabase, profile, aiResult) });
    }
    if (aiResult.intent === "show_goals") {
      return Response.json({ reply: await handleShowGoals(profile) });
    }
    if (aiResult.intent === "weekly_report") {
      return Response.json({ reply: await handleWeeklyReport(supabase, profile) });
    }
    if (aiResult.intent === "log_measurement") {
      return Response.json({ reply: await handleLogMeasurement(supabase, profile, aiResult) });
    }
    if (aiResult.intent === "measurement_status") {
      return Response.json({ reply: await handleMeasurementStatus(supabase, profile) });
    }
    if (aiResult.intent === "repeat_meal") {
      return Response.json({ reply: await handleRepeatMeal(supabase, profile, aiResult) });
    }
    if (aiResult.intent === "upgrade_premium") {
      return Response.json({ reply: handleUpgradePremium() });
    }
    if (aiResult.intent === "show_plan") {
      return Response.json({ reply: handleShowPlan(profile) });
    }
    if (aiResult.intent === "help") {
      return Response.json({ reply: HELP_MESSAGE });
    }
    if (aiResult.intent === "delete_account" && looksLikeAccountRequest(finalMessageText)) {
      return Response.json({ reply: await requestAccountDeletion(supabase, profile) });
    }

    return Response.json({ reply: UNKNOWN_REPLY });

  } catch (err) {
    console.error("process-message error:", err);
    return Response.json({ reply: "Bir hata oluştu, lütfen tekrar dene." });
  }
});

// ── Bekleyen öğün (öğün tipi sorusu) ───────────────────────
async function savePendingMeal(
  supabase: ReturnType<typeof createClient>,
  profileId: string,
  items: MealItem[],
  source: "text" | "photo"
): Promise<void> {
  const pending: PendingMeal = { items, source, local_date: getLocalDate() };
  const { error } = await supabase.from("profiles")
    .update({ pending_meal: pending, pending_meal_at: new Date().toISOString() })
    .eq("id", profileId);
  if (error) console.error("savePendingMeal error:", JSON.stringify(error));
}

async function clearPendingMeal(
  supabase: ReturnType<typeof createClient>,
  profileId: string
): Promise<void> {
  await supabase.from("profiles").update({ pending_meal: null, pending_meal_at: null }).eq("id", profileId);
}

function askMealTypeReply(items: MealItem[], source: "text" | "photo"): string {
  const header = source === "photo" ? "📸 Fotoğrafta şunları gördüm:" : "🍽️ Kaydedeceğim:";
  const lines = items.map((i) => {
    const qty = formatQty(i.quantity, i.unit);
    return `• ${i.name}${qty ? ` (${qty})` : ""}`;
  }).join("\n");
  return `${header}\n${lines}\n\n${MEAL_TYPE_QUESTION}`;
}

function wrapPhotoReply(reply: string): string {
  return `📸 Fotoğraftan tahmini değerlendirme\n\n${reply}\n\n⚠️ Bu değerler fotoğraftan yapılan bir tahmindir, kesin değildir. Değerler yanlışsa "yanlış girdim, aslında..." diyerek düzeltebilirsin.`;
}

async function finalizePendingMeal(
  supabase: ReturnType<typeof createClient>,
  profile: Record<string, unknown>,
  pending: PendingMeal,
  mealType: string
): Promise<string> {
  const aiResult = {
    intent: "log_meal",
    meal_type: mealType,
    items: pending.items,
    ambiguities: [],
  } as AIResponse;
  const reply = await handleLogMeal(supabase, profile, aiResult, mealType, pending.local_date);
  return pending.source === "photo" ? wrapPhotoReply(reply) : reply;
}

// ── Bekleyen silme işlemi (seçim / onay) ────────────────────
async function setPendingAction(
  supabase: ReturnType<typeof createClient>,
  profileId: string,
  action: PendingAction
): Promise<void> {
  const { error } = await supabase.from("profiles")
    .update({ pending_action: action, pending_action_at: new Date().toISOString() })
    .eq("id", profileId);
  if (error) console.error("setPendingAction error:", JSON.stringify(error));
}

async function clearPendingAction(
  supabase: ReturnType<typeof createClient>,
  profileId: string
): Promise<void> {
  await supabase.from("profiles").update({ pending_action: null, pending_action_at: null }).eq("id", profileId);
}

async function askDeleteChoice(
  supabase: ReturnType<typeof createClient>,
  profileId: string,
  range: DeleteRange
): Promise<string> {
  await setPendingAction(supabase, profileId, { type: "delete_choice", range });
  const question = range === "all"
    ? "❓ Bugünkü hangi kayıtlarının TAMAMINI silmek istiyorsun?"
    : "❓ Hangi son kaydını silmek istiyorsun?";
  return `${question}\n\n1️⃣ Yemek\n2️⃣ Su\n3️⃣ Takviye\n4️⃣ Antrenman\n5️⃣ Kilo\n6️⃣ Bugünün tamamı${CHOICE_HINT}\n\nVazgeçmek için "vazgeç" yazabilirsin.`;
}

async function requestDayReset(
  supabase: ReturnType<typeof createClient>,
  profileId: string
): Promise<string> {
  await setPendingAction(supabase, profileId, { type: "reset_day" });
  return DAY_RESET_CONFIRM_REPLY;
}

// ── Silme yönlendiricisi ──────────────────────────────────────
async function executeDeleteCommand(
  supabase: ReturnType<typeof createClient>,
  profile: Record<string, unknown>,
  cmd: DeleteCommand,
  text: string
): Promise<string> {
  const profileId = profile.id as string;

  if (cmd.kind === "day_reset") return await requestDayReset(supabase, profileId);
  if (cmd.kind === "ambiguous") return await askDeleteChoice(supabase, profileId, cmd.range ?? "last");

  if (cmd.kind === "named") {
    const targets = await extractDeleteTargets(text);
    if (targets.length === 0) return await askDeleteChoice(supabase, profileId, "last");
    // Birden fazla kategori eşleşmişse kategori ipucu kullanılmaz, her yerde aranır.
    // "portakal suyunu sil" gibi su/kilo kelimesi geçen isimler de her yerde aranır.
    const only = cmd.categories.length === 1 ? cmd.categories[0] : null;
    const hint = only && ["meal", "supplement", "workout"].includes(only) ? only : null;
    return await handleNamedDelete(supabase, profile, targets, cmd.mealType, hint);
  }

  // kind === "category"
  // "son içeceğimi sil", "son kahvaltımı sil": o türdeki SON kaydı sil
  if (cmd.categories.length === 1 && cmd.categories[0] === "meal" && cmd.mealType && cmd.range === "last") {
    return await deleteLastMeal(supabase, profile, cmd.mealType);
  }
  if (cmd.categories.length > 1 && cmd.range !== "all") {
    return await askDeleteChoice(supabase, profileId, "last");
  }
  const parts: string[] = [];
  for (const cat of cmd.categories) {
    parts.push(await deleteCategory(supabase, profile, cat, cmd.range ?? "last", cmd.mealType));
  }
  return parts.join("\n\n");
}

async function deleteCategory(
  supabase: ReturnType<typeof createClient>,
  profile: Record<string, unknown>,
  category: DeleteCategory,
  range: DeleteRange,
  mealType: string | null
): Promise<string> {
  switch (category) {
    case "meal":
      if (mealType) return await deleteMealsOfType(supabase, profile, mealType);
      return range === "all" ? await handleDeleteDayMeals(supabase, profile) : await deleteLastMeal(supabase, profile);
    case "water":
      return await deleteWaterToday(supabase, profile, range);
    case "supplement":
      return await deleteSupplementsToday(supabase, profile, range);
    case "workout":
      return await deleteWorkoutToday(supabase, profile, range);
    case "weight":
      return await handleDeleteLastWeight(supabase, profile);
    case "measurement":
      return await deleteMeasurementToday(supabase, profile);
  }
}

// Silinecek isimleri yalın halde çıkar ("hamburgeri" → "hamburger", "kreatini" → "kreatin")
async function extractDeleteTargets(text: string): Promise<MealItem[]> {
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `Kullanıcı bugünkü kayıtlarından bir şey silmek istiyor. Silinmesi istenen yiyecek, takviye veya egzersiz isimlerini YALIN halde çıkar (ör. "hamburgeri" → "hamburger", "kreatini" → "kreatin", "yumurtayı" → "yumurta", "bench press'i" → "bench press").
Öğün adlarını (kahvaltı, öğle, akşam, atıştırmalık), "son", "bütün", "kayıt", "su", "takviye", "antrenman" gibi genel kelimeleri isim olarak ALMA.
quantity'yi SADECE kullanıcı açıkça bir sayı söylediyse doldur, yoksa 0 yap.
SADECE JSON döndür: {"targets": [{"name": "", "quantity": 0, "unit": ""}]}`,
          },
          { role: "user", content: text },
        ],
      }),
    });
    const data = await response.json();
    if (!data.choices || !data.choices[0]) {
      console.error("extractDeleteTargets OpenAI response error:", JSON.stringify(data));
      return [];
    }
    const parsed = JSON.parse(data.choices[0].message.content);
    return ((parsed.targets ?? []) as MealItem[]).filter((t) => t && String(t.name ?? "").trim());
  } catch (err) {
    console.error("extractDeleteTargets error:", err);
    return [];
  }
}

// ── İsimle silme: önce yemekler, sonra takviyeler, sonra egzersizler ──
async function handleNamedDelete(
  supabase: ReturnType<typeof createClient>,
  profile: Record<string, unknown>,
  targets: MealItem[],
  mealTypeFilter: string | null,
  categoryHint: DeleteCategory | null
): Promise<string> {
  const localDate = getLocalDate();
  const lines: string[] = [];
  let remaining = targets;
  let mealTouched = false;

  if (!categoryHint || categoryHint === "meal") {
    const r = await deleteMealTargets(supabase, profile, remaining, mealTypeFilter);
    if (r.lines.length > 0) mealTouched = true;
    lines.push(...r.lines);
    remaining = r.notFound;
  }
  if (remaining.length > 0 && (!categoryHint || categoryHint === "supplement")) {
    const r = await deleteSupplementTargets(supabase, profile, remaining);
    lines.push(...r.lines);
    remaining = r.notFound;
  }
  if (remaining.length > 0 && (!categoryHint || categoryHint === "workout")) {
    const r = await deleteExerciseTargets(supabase, profile, remaining);
    lines.push(...r.lines);
    remaining = r.notFound;
  }

  const notFoundNames = remaining.map((t) => String(t.name).trim());

  if (lines.length === 0) {
    return `🔍 Bugünkü kayıtlarında "${notFoundNames.join(", ")}" bulamadım.\n\n${await todayRecordNames(supabase, profile)}\n\nNe silmek istediğini tam adıyla yazabilir ya da "son öğünümü sil", "son suyu sil" gibi komutlar kullanabilirsin.`;
  }

  let reply = `🗑️ Silindi:\n${lines.join("\n")}`;
  if (notFoundNames.length > 0) reply += `\n\n⚠️ Bulunamadı: ${notFoundNames.join(", ")}`;
  if (mealTouched) reply += "\n\n" + await dailyStatusText(supabase, profile, localDate);
  return reply;
}

async function deleteMealTargets(
  supabase: ReturnType<typeof createClient>,
  profile: Record<string, unknown>,
  targets: MealItem[],
  mealTypeFilter: string | null
): Promise<{ lines: string[]; notFound: MealItem[] }> {
  const meals = await getTodayMealsWithItems(supabase, profile.id as string, getLocalDate());
  const allItems = meals
    .slice()
    .reverse() // en yeni öğün önce
    .flatMap((m) => (m.meal_items ?? []).map((it) => ({ ...it, meal_type: m.meal_type })));

  const lines: string[] = [];
  const notFound: MealItem[] = [];
  const touchedMeals = new Set<string>();
  const usedItemIds = new Set<string>();

  for (const target of targets) {
    const targetName = String(target.name).trim();
    const tn = normalizeChoice(targetName);

    const { data: foundFoods } = await supabase.rpc("search_food", {
      search_term: targetName, user_id_param: profile.id,
    });
    const candidateIds = new Set(((foundFoods ?? []) as FoodRow[]).slice(0, 5).map((f) => f.id));

    const isMatch = (it: MealItemRow) => {
      if (usedItemIds.has(it.id)) return false;
      if (it.food_id && candidateIds.has(it.food_id)) return true;
      return nameMatches(it.food_name_snapshot, tn);
    };

    // Önce belirtilen öğünde ara; orada yoksa tüm günde ara
    let matches = allItems.filter((it) => isMatch(it) && (!mealTypeFilter || it.meal_type === mealTypeFilter));
    if (matches.length === 0 && mealTypeFilter) matches = allItems.filter((it) => isMatch(it));
    if (matches.length === 0) {
      notFound.push(target);
      continue;
    }

    let remainingQty: number | null = Number(target.quantity) > 0 ? Number(target.quantity) : null;
    const targetUnit = normUnit(target.unit);

    for (const it of matches) {
      const itQty = Number(it.quantity) || 0;
      const itUnit = normUnit(it.unit);
      const sameUnit = !targetUnit || !itUnit || targetUnit === itUnit;
      const label = MEAL_TYPE_LABELS[it.meal_type] ?? "";
      usedItemIds.add(it.id);
      touchedMeals.add(it.meal_id);

      // Kısmi silme: kayıtta daha fazlası varsa sadece istenen miktarı düş
      if (remainingQty !== null && sameUnit && itQty > remainingQty) {
        const keep = (itQty - remainingQty) / itQty;
        const removedFrac = remainingQty / itQty;
        await supabase.from("meal_items").update({
          quantity: round1(itQty - remainingQty),
          grams_resolved: round1(Number(it.grams_resolved) * keep),
          calories: round1(Number(it.calories) * keep),
          protein: round1(Number(it.protein) * keep),
          carbs: round1(Number(it.carbs) * keep),
          fat: round1(Number(it.fat) * keep),
        }).eq("id", it.id);
        lines.push(`${formatItemLine(it.food_name_snapshot, remainingQty, it.unit, Number(it.calories) * removedFrac, Number(it.protein) * removedFrac)} · ${label}`);
        remainingQty = 0;
        break;
      }

      await supabase.from("meal_items").delete().eq("id", it.id);
      lines.push(`${formatItemLine(it.food_name_snapshot, it.quantity, it.unit, Number(it.calories), it.protein)} · ${label}`);

      // Miktar belirtilmediyse sadece en son kaydı sil
      if (remainingQty === null || !sameUnit) break;
      remainingQty -= itQty;
      if (remainingQty <= 0) break;
    }
  }

  for (const mealId of touchedMeals) {
    await recomputeMealTotals(supabase, mealId);
  }
  return { lines, notFound };
}

async function deleteSupplementTargets(
  supabase: ReturnType<typeof createClient>,
  profile: Record<string, unknown>,
  targets: MealItem[]
): Promise<{ lines: string[]; notFound: MealItem[] }> {
  const { data } = await supabase
    .from("supplement_logs").select("id, supplement_name, amount")
    .eq("user_id", profile.id).eq("local_date", getLocalDate())
    .order("taken_at", { ascending: false });
  const rows = (data ?? []) as { id: string; supplement_name: string; amount: string | null }[];
  const used = new Set<string>();
  const lines: string[] = [];
  const notFound: MealItem[] = [];

  for (const target of targets) {
    const tn = normalizeChoice(String(target.name));
    const match = rows.find((r) => !used.has(r.id) && nameMatches(r.supplement_name, tn));
    if (!match) {
      notFound.push(target);
      continue;
    }
    used.add(match.id);
    await supabase.from("supplement_logs").delete().eq("id", match.id);
    lines.push(`• ${match.supplement_name}${match.amount ? ` (${match.amount})` : ""} · Takviye`);
  }
  return { lines, notFound };
}

async function deleteExerciseTargets(
  supabase: ReturnType<typeof createClient>,
  profile: Record<string, unknown>,
  targets: MealItem[]
): Promise<{ lines: string[]; notFound: MealItem[] }> {
  const { data: sessions } = await supabase
    .from("workout_sessions").select("id")
    .eq("user_id", profile.id).eq("local_date", getLocalDate());
  const sessionIds = (sessions ?? []).map((s: { id: string }) => s.id);
  if (sessionIds.length === 0) return { lines: [], notFound: targets };

  const { data } = await supabase
    .from("workout_exercises").select("id, exercise_name")
    .in("session_id", sessionIds)
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as { id: string; exercise_name: string }[];
  const used = new Set<string>();
  const lines: string[] = [];
  const notFound: MealItem[] = [];

  for (const target of targets) {
    const tn = normalizeChoice(String(target.name));
    const match = rows.find((r) => !used.has(r.id) && nameMatches(r.exercise_name, tn));
    if (!match) {
      notFound.push(target);
      continue;
    }
    used.add(match.id);
    await supabase.from("workout_exercises").delete().eq("id", match.id);
    lines.push(`• ${match.exercise_name} · Antrenman`);
  }
  return { lines, notFound };
}

// Bulunamayan bir şey silinmek istendiğinde bugün kaydedilenleri listeler
async function todayRecordNames(
  supabase: ReturnType<typeof createClient>,
  profile: Record<string, unknown>
): Promise<string> {
  const localDate = getLocalDate();
  const meals = await getTodayMealsWithItems(supabase, profile.id as string, localDate);
  const foodNames = [...new Set(meals.flatMap((m) => (m.meal_items ?? []).map((it) => it.food_name_snapshot)))];

  const { data: supps } = await supabase
    .from("supplement_logs").select("supplement_name")
    .eq("user_id", profile.id).eq("local_date", localDate);
  const suppNames = [...new Set((supps ?? []).map((s: { supplement_name: string }) => s.supplement_name))];

  const { data: sessions } = await supabase
    .from("workout_sessions").select("id")
    .eq("user_id", profile.id).eq("local_date", localDate);
  const sessionIds = (sessions ?? []).map((s: { id: string }) => s.id);
  let exerciseNames: string[] = [];
  if (sessionIds.length > 0) {
    const { data: ex } = await supabase.from("workout_exercises").select("exercise_name").in("session_id", sessionIds);
    exerciseNames = [...new Set((ex ?? []).map((e: { exercise_name: string }) => e.exercise_name))];
  }

  const parts: string[] = [];
  if (foodNames.length) parts.push(`🍽️ Yemek: ${foodNames.join(", ")}`);
  if (suppNames.length) parts.push(`💊 Takviye: ${suppNames.join(", ")}`);
  if (exerciseNames.length) parts.push(`🏋️‍♂️ Antrenman: ${exerciseNames.join(", ")}`);
  return parts.length ? `Bugün kaydettiklerin:\n${parts.join("\n")}` : "Bugün henüz yemek, takviye veya antrenman kaydın yok.";
}

// ── Kategori bazlı silmeler (sadece bugün) ────────────────────
async function deleteLastMeal(
  supabase: ReturnType<typeof createClient>,
  profile: Record<string, unknown>,
  mealType: string | null = null
): Promise<string> {
  const localDate = getLocalDate();
  const meals = (await getTodayMealsWithItems(supabase, profile.id as string, localDate))
    .filter((m) => !mealType || m.meal_type === mealType);
  if (meals.length === 0) {
    return mealType === "drink" ? "Bugün silinecek bir içecek kaydın yok." : "Bugün silinecek bir öğün kaydın yok.";
  }

  const target = meals[meals.length - 1];
  await supabase.from("meals").delete().eq("id", target.id);

  const what = target.meal_type === "drink" ? "Son içecek kaydın silindi" : "Son öğünün silindi";
  let reply = `🗑️ ${what}: ${MEAL_TYPE_LABELS[target.meal_type] ?? "Öğün"} (${Math.round(Number(target.total_calories))} Kcal)\n\n`;
  for (const it of target.meal_items ?? []) {
    reply += formatItemLine(it.food_name_snapshot, it.quantity, it.unit, Number(it.calories), it.protein) + "\n";
  }
  reply += "\n" + await dailyStatusText(supabase, profile, localDate);
  return reply;
}

async function deleteMealsOfType(
  supabase: ReturnType<typeof createClient>,
  profile: Record<string, unknown>,
  mealType: string
): Promise<string> {
  const localDate = getLocalDate();
  const label = MEAL_TYPE_LABELS[mealType] ?? "Öğün";
  const group = (await getTodayMealsWithItems(supabase, profile.id as string, localDate))
    .filter((m) => m.meal_type === mealType);
  if (group.length === 0) {
    return mealType === "drink" ? "Bugün silinecek bir içecek kaydın yok." : `Bugün silinecek bir ${label.toLocaleLowerCase("tr-TR")} kaydın yok.`;
  }

  await supabase.from("meals").delete().in("id", group.map((m) => m.id));
  return `🗑️ Bugünkü ${label} silindi\n${formatMealsByType(group)}\n${await dailyStatusText(supabase, profile, localDate)}`.trim();
}

async function deleteWaterToday(
  supabase: ReturnType<typeof createClient>,
  profile: Record<string, unknown>,
  range: DeleteRange
): Promise<string> {
  if (range === "last") return await handleDeleteLastWater(supabase, profile);
  const { data } = await supabase
    .from("water_logs").delete()
    .eq("user_id", profile.id).eq("local_date", getLocalDate())
    .select("amount_ml");
  if (!data || data.length === 0) return "Bugün silinecek bir su kaydın yok.";
  const total = data.reduce((s: number, r: { amount_ml: number }) => s + Number(r.amount_ml || 0), 0);
  return `🗑️ Bugünkü tüm su kayıtların silindi (${data.length} kayıt, ${total} ml).`;
}

async function deleteSupplementsToday(
  supabase: ReturnType<typeof createClient>,
  profile: Record<string, unknown>,
  range: DeleteRange
): Promise<string> {
  const localDate = getLocalDate();
  if (range === "last") {
    const { data: last } = await supabase
      .from("supplement_logs").select("id, supplement_name, amount")
      .eq("user_id", profile.id).eq("local_date", localDate)
      .order("taken_at", { ascending: false }).limit(1).maybeSingle();
    if (!last) return "Bugün silinecek bir takviye kaydın yok.";
    await supabase.from("supplement_logs").delete().eq("id", last.id);
    return `🗑️ Son takviye kaydın silindi: ${last.supplement_name}${last.amount ? ` (${last.amount})` : ""}`;
  }
  const { data } = await supabase
    .from("supplement_logs").delete()
    .eq("user_id", profile.id).eq("local_date", localDate)
    .select("supplement_name, amount");
  if (!data || data.length === 0) return "Bugün silinecek bir takviye kaydın yok.";
  const list = data.map((r: { supplement_name: string; amount: string | null }) =>
    `• ${r.supplement_name}${r.amount ? ` (${r.amount})` : ""}`).join("\n");
  return `🗑️ Bugünkü tüm takviye kayıtların silindi:\n${list}`;
}

// Bugünkü tüm antrenman seanslarını ve egzersizlerini siler
async function deleteWorkoutSessionsToday(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  localDate: string
): Promise<{ sessions: number; exercises: string[] }> {
  const { data: sessions } = await supabase
    .from("workout_sessions").select("id")
    .eq("user_id", userId).eq("local_date", localDate);
  const ids = (sessions ?? []).map((s: { id: string }) => s.id);
  if (ids.length === 0) return { sessions: 0, exercises: [] };

  const { data: ex } = await supabase
    .from("workout_exercises").delete().in("session_id", ids).select("exercise_name");
  await supabase.from("workout_sessions").delete().in("id", ids);
  return { sessions: ids.length, exercises: (ex ?? []).map((e: { exercise_name: string }) => e.exercise_name) };
}

async function deleteWorkoutToday(
  supabase: ReturnType<typeof createClient>,
  profile: Record<string, unknown>,
  range: DeleteRange
): Promise<string> {
  if (range === "last") return await handleDeleteLastExercise(supabase, profile);
  const r = await deleteWorkoutSessionsToday(supabase, profile.id as string, getLocalDate());
  if (r.sessions === 0) return "Bugün silinecek bir antrenman kaydın yok.";
  const list = r.exercises.length ? `\n${r.exercises.map((n) => `• ${n}`).join("\n")}` : "";
  return `🗑️ Bugünkü antrenmanın silindi.${list}`;
}

async function deleteMeasurementToday(
  supabase: ReturnType<typeof createClient>,
  profile: Record<string, unknown>
): Promise<string> {
  const { data } = await supabase
    .from("body_measurements").delete()
    .eq("user_id", profile.id).eq("local_date", getLocalDate())
    .select("id");
  if (!data || data.length === 0) return "Bugün silinecek bir ölçü kaydın yok.";
  return "🗑️ Bugünkü vücut ölçüsü kaydın silindi.";
}

// ── Bugünü sıfırla (EVET onayından sonra) ───────────────────
async function resetDay(
  supabase: ReturnType<typeof createClient>,
  profile: Record<string, unknown>
): Promise<string> {
  const userId = profile.id as string;
  const localDate = getLocalDate();

  const del = async (table: string): Promise<number> => {
    const { data, error } = await supabase.from(table).delete()
      .eq("user_id", userId).eq("local_date", localDate).select("id");
    if (error) console.error(`resetDay ${table} error:`, JSON.stringify(error));
    return data?.length ?? 0;
  };

  const meals = await del("meals");
  const water = await del("water_logs");
  const supps = await del("supplement_logs");
  const weight = await del("weight_logs");
  const meas = await del("body_measurements");
  const workout = await deleteWorkoutSessionsToday(supabase, userId, localDate);

  return `🧹 Bugünkü tüm kayıtların silindi.\n\n• Öğün: ${meals}\n• Su: ${water}\n• Takviye: ${supps}\n• Egzersiz: ${workout.exercises.length}\n• Kilo: ${weight}\n• Ölçü: ${meas}`;
}

// ── Kullanıcı bulma (id ile) ──────────────────────────────
async function getProfileById(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from("profiles").select("*").eq("id", userId).single();
  if (error || !data) return null;
  return data;
}

// ── Kullanıcı bul, yoksa oluştur ─────────────────────────
async function findOrCreateProfileByPhone(
  supabase: ReturnType<typeof createClient>,
  phone: string
): Promise<Record<string, unknown> | null> {
  const { data: existing } = await supabase
    .from("profiles").select("*").eq("phone_e164", phone).maybeSingle();
  if (existing) return existing;

  const placeholderEmail = `${phone.replace(/\+/g, "")}@sportakip.internal`;
  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email: placeholderEmail,
    password: crypto.randomUUID(),
    email_confirm: true,
  });

  // Profil silinmiş ama auth.users kaydı duruyorsa (email_exists) mevcut id'yi kullan
  let authUserId: string | null = authUser?.user?.id ?? null;
  if (!authUserId) {
    const { data: existingId, error: rpcError } = await supabase.rpc("get_auth_user_id_by_email", { p_email: placeholderEmail });
    if (rpcError) console.error("get_auth_user_id_by_email error:", rpcError);
    if (existingId) authUserId = existingId as string;
  }
  if (!authUserId) {
    console.error("Auth user create error:", authError);
    return null;
  }

  const { data: newProfile, error: profileError } = await supabase
    .from("profiles")
    .insert({ id: authUserId, phone_e164: phone, onboarding_step: -2 })
    .select().single();

  if (profileError || !newProfile) {
    console.error("Profile create error:", profileError);
    return null;
  }
  return newProfile;
}

// ── Hesap silme talebi (onay bekler) ────────────────────
async function requestAccountDeletion(
  supabase: ReturnType<typeof createClient>,
  profile: Record<string, unknown>
): Promise<string> {
  const { error } = await supabase.from("profiles")
    .update({ delete_requested_at: new Date().toISOString() })
    .eq("id", profile.id);
  if (error) {
    console.error("requestAccountDeletion error:", JSON.stringify(error));
    return DELETE_FAIL_REPLY;
  }
  return DELETE_CONFIRM_REPLY;
}

// ── Hesabı ve tüm verileri kalıcı olarak sil ─────────────
// auth.users silinince profiles CASCADE ile, profiles silinince de
// tüm kullanıcı tabloları (meals, meal_items, water/weight/supplement_logs,
// workout_*, body_measurements, kullanıcının kendi foods kayıtları) CASCADE ile silinir.
// message_logs'ta user_id dolu olmadığı için wamid içindeki numaradan ayrıca temizlenir.
async function deleteAccount(
  supabase: ReturnType<typeof createClient>,
  profile: Record<string, unknown>
): Promise<boolean> {
  const userId = profile.id as string;
  const phone = profile.phone_e164 as string | null;

  if (phone) {
    const { data: deletedLogs, error: logErr } = await supabase.rpc("delete_message_logs_for_phone", { p_phone: phone });
    if (logErr) console.error("delete_message_logs_for_phone error:", JSON.stringify(logErr));
    else console.log(`deleteAccount: ${deletedLogs} message_logs satırı silindi`);
  }

  const { error: authErr } = await supabase.auth.admin.deleteUser(userId);
  if (authErr) {
    console.error("deleteAccount auth.admin.deleteUser error:", JSON.stringify(authErr));
    // Yedek: en azından profil ve bağlı tüm verileri sil
    const { error: profErr } = await supabase.from("profiles").delete().eq("id", userId);
    if (profErr) {
      console.error("deleteAccount profiles delete error:", JSON.stringify(profErr));
      return false;
    }
  }

  console.log(`deleteAccount: kullanıcı ${userId} silindi`);
  return true;
}

// ── Kalori/Makro hesaplama (paylaşılan mantık) ────────────
function computeGoals(
  age: number, heightCm: number, gender: string, activityMult: number,
  weightKg: number, goalType: string
): { calorieGoal: number; proteinGoal: number; carbsGoal: number; fatGoal: number } {
  const bmr = gender === "female"
    ? (10 * weightKg + 6.25 * heightCm - 5 * age - 161)
    : (10 * weightKg + 6.25 * heightCm - 5 * age + 5);
  const tdee = bmr * activityMult;

  let calorieGoal = tdee;
  if (goalType === "kilo_verme") calorieGoal = tdee - 500;
  else if (goalType === "kilo_alma") calorieGoal = tdee + 350;
  // rekompozisyon ve koruma: bakım kalorisi (TDEE)
  calorieGoal = Math.min(6000, Math.max(1200, Math.round(calorieGoal)));

  // Rekompozisyonda kas kazanımını desteklemek için protein biraz daha yüksek
  const proteinPerKg = goalType === "rekompozisyon" ? 2.2 : 2;
  const proteinGoal = Math.min(400, Math.max(20, Math.round(weightKg * proteinPerKg)));
  const fatGoal = Math.min(300, Math.max(10, Math.round((calorieGoal * 0.25) / 9)));
  const carbsGoal = Math.min(800, Math.max(0, Math.round((calorieGoal - proteinGoal * 4 - fatGoal * 9) / 4)));

  return { calorieGoal, proteinGoal, carbsGoal, fatGoal };
}

// ── Kullanıcının premium'da olup olmadığını kontrol et ────
function isPremiumActive(profile: Record<string, unknown>): boolean {
  if (profile.plan !== "premium") return false;
  const until = profile.premium_until as string | null;
  if (!until) return true;
  return until >= getLocalDate();
}

// ── Güvenli profil güncelleme (hatayı logla, sessizce yutma) ─
async function safeUpdateProfile(
  supabase: ReturnType<typeof createClient>,
  profileId: string,
  fields: Record<string, unknown>,
  context: string
): Promise<boolean> {
  const { error } = await supabase.from("profiles").update(fields).eq("id", profileId);
  if (error) {
    console.error(`safeUpdateProfile [${context}] error:`, JSON.stringify(error));
    return false;
  }
  return true;
}

const ONBOARDING_SAVE_FAIL_REPLY = "⚠️ Bir şeyler ters gitti, cevabını kaydedemedim. Lütfen tekrar yazar mısın?";

// ── Onboarding ────────────────────────────────────────────
async function handleOnboarding(
  supabase: ReturnType<typeof createClient>,
  profile: Record<string, unknown>,
  messageText: string
): Promise<{ reply: string; justFinished: boolean }> {
  const step = profile.onboarding_step as number;

  if (messageText.trim().toLowerCase() === "geri" && step > 0) {
    const prevStep = step - 1;
    await supabase.from("profiles").update({ onboarding_step: prevStep }).eq("id", profile.id);
    if (prevStep === 0) {
      return { reply: "Adını tekrar yazar mısın?", justFinished: false };
    }
    return { reply: `⬅️ Önceki soruya döndük.\n\n${ONBOARDING_QUESTIONS[prevStep]}`, justFinished: false };
  }

  // Adım 0: İsim
  if (step === 0) {
    const name = messageText.trim().slice(0, 100);
    const ok0 = await safeUpdateProfile(supabase, profile.id as string, { full_name: name, onboarding_step: 1 }, "step0-name");
    if (!ok0) return { reply: ONBOARDING_SAVE_FAIL_REPLY, justFinished: false };
    return { reply: ONBOARDING_QUESTIONS[1].replace("{name}", name), justFinished: false };
  }

  // Adım 1: Su hedefi
  if (step === 1) {
    const match = messageText.match(/\d+/);
    const waterVal = match ? parseInt(match[0], 10) : NaN;
    if (!match || waterVal < 500 || waterVal > 10000) {
      return { reply: "Lütfen 500-10000 ml arasında bir sayı yaz (örn: 2500).", justFinished: false };
    }
    const ok1 = await safeUpdateProfile(supabase, profile.id as string, { water_goal_ml: waterVal, onboarding_step: 2 }, "step1-water");
    if (!ok1) return { reply: ONBOARDING_SAVE_FAIL_REPLY, justFinished: false };
    return { reply: ONBOARDING_QUESTIONS[2], justFinished: false };
  }

  // Adım 2: Yaş
  if (step === 2) {
    const match = messageText.match(/\d+/);
    const ageVal = match ? parseInt(match[0], 10) : NaN;
    if (!match || ageVal < 10 || ageVal > 100) {
      return { reply: "Lütfen yaşını 10-100 arasında bir sayı olarak yaz (örn: 25).", justFinished: false };
    }
    const ok2 = await safeUpdateProfile(supabase, profile.id as string, { age: ageVal, onboarding_step: 3 }, "step2-age");
    if (!ok2) return { reply: ONBOARDING_SAVE_FAIL_REPLY, justFinished: false };
    return { reply: ONBOARDING_QUESTIONS[3], justFinished: false };
  }

  // Adım 3: Boy
  if (step === 3) {
    const match = messageText.match(/\d+(\.\d+)?/);
    const heightVal = match ? parseFloat(match[0]) : NaN;
    if (!match || heightVal < 70 || heightVal > 250) {
      return { reply: "Lütfen boyunu 70-250 cm arasında bir sayı olarak yaz (örn: 175).", justFinished: false };
    }
    const ok3 = await safeUpdateProfile(supabase, profile.id as string, { height_cm: heightVal, onboarding_step: 4 }, "step3-height");
    if (!ok3) return { reply: ONBOARDING_SAVE_FAIL_REPLY, justFinished: false };
    return { reply: ONBOARDING_QUESTIONS[4], justFinished: false };
  }

  // Adım 4: Cinsiyet (numara veya yazı)
  if (step === 4) {
    const gender = parseGender(messageText);
    if (!gender) {
      return { reply: "Lütfen 1 / 2 yaz ya da \"erkek\" / \"kadın\" şeklinde cevapla.", justFinished: false };
    }
    const ok4 = await safeUpdateProfile(supabase, profile.id as string, { gender, onboarding_step: 5 }, "step4-gender");
    if (!ok4) return { reply: ONBOARDING_SAVE_FAIL_REPLY, justFinished: false };
    return { reply: ONBOARDING_QUESTIONS[5], justFinished: false };
  }

  // Adım 5: Kilo
  if (step === 5) {
    const match = messageText.match(/\d+(\.\d+)?/);
    const weightVal = match ? parseFloat(match[0]) : NaN;
    if (!match || weightVal < 30 || weightVal > 250) {
      return { reply: "Lütfen kilonu 30-250 kg arasında bir sayı olarak yaz (örn: 75).", justFinished: false };
    }
    const weightKg = weightVal;
    const localDate = getLocalDate();
    const { data: existing } = await supabase
      .from("weight_logs").select("id")
      .eq("user_id", profile.id).eq("local_date", localDate).maybeSingle();
    if (existing) {
      await supabase.from("weight_logs").update({ weight: weightKg }).eq("id", existing.id);
    } else {
      await supabase.from("weight_logs").insert({
        user_id: profile.id, weight: weightKg, local_date: localDate,
      });
    }
    const ok5 = await safeUpdateProfile(supabase, profile.id as string, { onboarding_step: 6 }, "step5-weight");
    if (!ok5) return { reply: ONBOARDING_SAVE_FAIL_REPLY, justFinished: false };
    return { reply: ONBOARDING_QUESTIONS[6], justFinished: false };
  }

  // Adım 6: Aktivite seviyesi (numara veya yazı)
  if (step === 6) {
    const key = parseActivity(messageText);
    const chosen = key ? ACTIVITY_MAP[key] : undefined;
    if (!chosen) {
      return { reply: "Lütfen 1-4 arası bir numara ya da seçeneğin adını yaz (örn: \"orta aktif\").", justFinished: false };
    }
    const ok6 = await safeUpdateProfile(supabase, profile.id as string, { activity_level: chosen.level, activity_multiplier: chosen.mult, onboarding_step: 7 }, "step6-activity");
    if (!ok6) return { reply: ONBOARDING_SAVE_FAIL_REPLY, justFinished: false };
    return { reply: ONBOARDING_QUESTIONS[7], justFinished: false };
  }

  // Adım 7: Hedef (numara veya yazı) → otomatik kalori/makro hesabı
  if (step === 7) {
    const goalType = parseGoalType(messageText);
    if (!goalType) {
      return { reply: "Lütfen 1-4 arası bir numara ya da seçeneğin adını yaz (örn: \"kilo vermek\").", justFinished: false };
    }

    const { data: freshProfile } = await supabase
      .from("profiles").select("age, height_cm, gender, activity_multiplier")
      .eq("id", profile.id).single();
    const { data: latestWeight } = await supabase
      .from("weight_logs").select("weight")
      .eq("user_id", profile.id)
      .order("local_date", { ascending: false }).limit(1).maybeSingle();

    const age = (freshProfile?.age as number) ?? 25;
    const heightCm = (freshProfile?.height_cm as number) ?? 170;
    const gender = (freshProfile?.gender as string) ?? "male";
    const activityMult = (freshProfile?.activity_multiplier as number) ?? 1.375;
    const weightKg = latestWeight?.weight ? Number(latestWeight.weight) : 70;

    const { calorieGoal, proteinGoal, carbsGoal, fatGoal } = computeGoals(
      age, heightCm, gender, activityMult, weightKg, goalType
    );

    const ok7 = await safeUpdateProfile(supabase, profile.id as string, {
      goal_type: goalType,
      calorie_goal: calorieGoal,
      protein_goal: proteinGoal,
      carbs_goal: carbsGoal,
      fat_goal: fatGoal,
      onboarding_step: 8,
    }, "step7-goal");
    if (!ok7) return { reply: ONBOARDING_SAVE_FAIL_REPLY, justFinished: false };

    const goalLabel = GOAL_TYPE_LABELS[goalType] || goalType;

    const summary = `✅ Hedeflerin hesaplandı! (${goalLabel})\n\nKalori: ${calorieGoal} Kcal\nProtein: ${proteinGoal} g\nKarbonhidrat: ${carbsGoal} g\nYağ: ${fatGoal} g\n\nBunları istediğin zaman "kalori hedefimi 2800 yap" gibi bir mesajla elle değiştirebilirsin.\n\n${ONBOARDING_QUESTIONS[8]}`;

    return { reply: summary, justFinished: false };
  }

  // Adım 8: Takviyeler (serbest metin → AI ile ayıkla, sadece geçerli takviyeleri kaydet)
  if (step === 8) {
    const noVariants = ["yok", "yokk", "yoktur", "hayır", "hayir", "kullanmıyorum", "kullanmiyorum", "no", "-"];
    const normalized = messageText.trim().toLowerCase();
    let finalValue = noVariants.includes(normalized) ? "yok" : messageText.trim().slice(0, 500);

    if (finalValue !== "yok") {
      const supplements = await parseSupplementsText(messageText);
      if (supplements !== null) {
        const valid = supplements.filter((s) => !supplementRejectReason(s));
        if (valid.length > 0) {
          const localDate = getLocalDate();
          for (const supp of valid) {
            await supabase.from("supplement_logs").insert({
              user_id: profile.id, supplement_name: supp.name,
              amount: supp.amount || null, local_date: localDate,
            });
          }
          finalValue = valid
            .map((s) => s.amount ? `${s.name} (${s.amount})` : s.name)
            .join(", ")
            .slice(0, 500);
        } else {
          finalValue = "yok";
        }
      }
    }

    const ok8 = await safeUpdateProfile(supabase, profile.id as string, { supplements: finalValue, onboarding_step: 9 }, "step8-supplements");
    if (!ok8) return { reply: ONBOARDING_SAVE_FAIL_REPLY, justFinished: false };
    return { reply: ONBOARDING_QUESTIONS[9], justFinished: false };
  }

  // Adım 9: Antrenman programı (serbest metin → AI ile workout_programs'a kaydet)
  if (step === 9) {
    const noVariants = ["yok", "yokk", "yoktur", "hayır", "hayir", "kullanmıyorum", "kullanmiyorum", "no", "-"];
    const normalized = messageText.trim().toLowerCase();
    const finalValue = noVariants.includes(normalized) ? "yok" : messageText.trim().slice(0, 500);

    if (finalValue !== "yok") {
      const program = await parseTrainingProgramText(messageText);
      if (program && program.length > 0) {
        await supabase.from("workout_programs").delete().eq("user_id", profile.id);
        for (const day of program) {
          await supabase.from("workout_programs").insert({
            user_id: profile.id,
            day_number: day.day_number,
            day_label: day.day_label,
            exercises: day.exercises || [],
          });
        }
        await supabase.from("profiles").update({
          program_start_date: getLocalDate(),
          program_cycle_length: program.length,
        }).eq("id", profile.id);
      }
    }

    const ok9 = await safeUpdateProfile(supabase, profile.id as string, { training_program: finalValue, onboarding_step: 10 }, "step9-program");
    if (!ok9) return { reply: ONBOARDING_SAVE_FAIL_REPLY, justFinished: false };
    return { reply: ONBOARDING_QUESTIONS[10], justFinished: false };
  }

  // Adım 10: Kardiyo (serbest metin)
  if (step === 10) {
    const noVariants = ["yok", "yokk", "yoktur", "hayır", "hayir", "kullanmıyorum", "kullanmiyorum", "no", "-"];
    const normalized = messageText.trim().toLowerCase();
    const finalValue = noVariants.includes(normalized) ? "yok" : messageText.trim().slice(0, 500);

    const ok10 = await safeUpdateProfile(supabase, profile.id as string, { cardio_activity: finalValue, onboarding_step: 11 }, "step10-cardio");
    if (!ok10) return { reply: ONBOARDING_SAVE_FAIL_REPLY, justFinished: false };

    const name = (profile.full_name as string) || "";
    return {
      reply: `✅ Tüm bilgilerin kaydedildi${name ? ", " + name : ""}! Artık kullanmaya başlayabilirsin.\n\nHızlı başlangıç:\n🍽️ "2 yumurta yedim"\n🥤 "1 kutu kola içtim"\n💧 "500 ml su içtim"\n📊 "bugün"\n\n📖 Tüm komutları görmek için *komutlar* yaz.`,
      justFinished: true,
    };
  }

  return { reply: "Bir şeyler ters gitti, lütfen tekrar dene.", justFinished: false };
}

// ── Onboarding: serbest metni takviye listesine ayrıştır ──
// Hata durumunda null, takviye yoksa boş dizi döner.
async function parseSupplementsText(text: string): Promise<SupplementItem[] | null> {
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `Kullanıcının serbest metinle anlattığı takviyeleri (supplement) ayıkla. Her takviye için isim ve varsa dozaj/miktar bilgisini çıkar. Birden fazla takviye olabilir. Hiç takviye yoksa veya anlaşılamıyorsa supplements'i boş dizi [] yap.

${SUPPLEMENT_CATEGORY_GUIDE}

SADECE JSON döndür:
{"supplements": [{"name": "...", "amount": "...", "category": "vitamin"}]}`,
          },
          { role: "user", content: text },
        ],
      }),
    });
    const data = await response.json();
    if (!data.choices || !data.choices[0]) {
      console.error("parseSupplementsText OpenAI response error:", JSON.stringify(data));
      return null;
    }
    const parsed = JSON.parse(data.choices[0].message.content);
    return (parsed.supplements as SupplementItem[]) ?? [];
  } catch (err) {
    console.error("parseSupplementsText error:", err);
    return null;
  }
}

// ── Onboarding: serbest metni antrenman programına ayrıştır ──
async function parseTrainingProgramText(text: string): Promise<ProgramDay[] | null> {
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `Sen bir antrenman programı ayrıştırma uzmanısın. Kullanıcının serbest metinle, kısaltmalarla veya günlere ayırmadan anlattığı antrenman programını yapılandırılmış hale getir.

KRİTİK KURAL: day_label alanını ASLA kullanıcının yazdığı ham kelime/kısaltma olarak bırakma. Mutlaka anlaşılır, Türkçe bir gün adına çevir. Sözlük:
- push → "İtiş Günü (Göğüs/Omuz/Triceps)"
- pull → "Çekiş Günü (Sırt/Biceps)"
- leg / bacak → "Bacak Günü"
- kol → "Kol Günü"
- of / off / dinlenme / rest / dinlenmeni → "Dinlenme"
- fullbody / tam vücut → "Tüm Vücut"
- cardio / kardiyo → "Kardiyo Günü"
Sözlükte olmayan bir kelime gelirse (örn. "sırt", "göğüs", "omuz", "karın") onu da anlamlı bir gün etiketine çevir, tahmin yürüt — ham kelimeyi asla olduğu gibi bırakma.

"push-pull-leg-kol-of-fullbody-of" gibi tire ile ayrılmış bir liste, sırayla günleri temsil eder. Örnek doğru çıktı bu girdi için:
{"program": [{"day_number":1,"day_label":"İtiş Günü (Göğüs/Omuz/Triceps)","exercises":[]},{"day_number":2,"day_label":"Çekiş Günü (Sırt/Biceps)","exercises":[]},{"day_number":3,"day_label":"Bacak Günü","exercises":[]},{"day_number":4,"day_label":"Kol Günü","exercises":[]},{"day_number":5,"day_label":"Dinlenme","exercises":[]},{"day_number":6,"day_label":"Tüm Vücut","exercises":[]},{"day_number":7,"day_label":"Dinlenme","exercises":[]}]}

Eğer belirli hareketler (bench press, squat vb.) belirtilmemişse exercises dizisini boş bırak. Eğer hareketler belirtilmişse exercises alanına ekle (sets/reps varsa doldur, yoksa bu alanları boş bırak). day_number 1'den başlar ve sırayla artar. Hiçbir program bilgisi çıkaramıyorsan program'ı boş dizi [] yap. SADECE JSON döndür:
{"program": [{"day_number": 1, "day_label": "...", "exercises": [{"name": "...", "sets": 0, "reps": ""}]}]}`,
          },
          { role: "user", content: text },
        ],
      }),
    });
    const data = await response.json();
    if (!data.choices || !data.choices[0]) {
      console.error("parseTrainingProgramText OpenAI response error:", JSON.stringify(data));
      return null;
    }
    const parsed = JSON.parse(data.choices[0].message.content);
    const program = parsed.program as ProgramDay[];
    if (!program || program.length === 0) return null;
    return program;
  } catch (err) {
    console.error("parseTrainingProgramText error:", err);
    return null;
  }
}

// ── OpenAI Intent Parser ──────────────────────────────────
async function parseWithAI(message: string): Promise<AIResponse> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Sen bir beslenme ve sağlık asistanısın. Kullanıcının Türkçe mesajını analiz et ve SADECE JSON döndür.

Intent örnekleri:
- "bugün", "günlük özet", "ne kadar kaldı" → daily_summary
- "komutlar", "komutlar neydi", "yardım", "neler yapabilirsin", "nasıl kullanılır" → help
- "ne yedim", "bugün ne yedim", "öğünlerim" → meal_history (meal_type boş)
- "bugün ne içtim", "içeceklerim", "neler içtim" → meal_history (meal_type: "drink")
- "kahvaltıda ne yedim", "öğlen ne yedim", "öğle yemeğinde ne yedim", "akşam ne yedim", "atıştırmalık olarak ne yedim" → meal_history (meal_type: "breakfast"/"lunch"/"dinner"/"snack")
- "yumurta yedim", "kahvaltıda 2 yumurta yedim", gram/adet içeren yemek mesajları → log_meal
- "500 ml su içtim", "1 bardak su", "2 şişe su", "1.5 litre su içtim", "2 lt su" → log_water (amount_ml: ml cinsinden — litre/lt/L geçiyorsa 1000 ile çarp, 1 bardak=200ml, 1 şişe=500ml). log_water SADECE düz su içindir.
- Su DIŞINDAKİ içecekler: "250 ml kola içtim", "1 kutu kola", "1 bardak ayran içtim", "2 çay içtim", "türk kahvesi içtim", "portakal suyu içtim", "maden suyu içtim", "1 şişe ice tea" → log_drink (items: [{name, quantity, unit}] — name yalın ve genel: "kola", "ayran", "çay", "türk kahvesi", "portakal suyu", "soda" (maden suyu için); unit: ml/litre/bardak/kutu/şişe/fincan/kupa; miktar yoksa quantity 1, unit "bardak"). Mesajda düz su da varsa (örn. "1 litre su ve 1 kutu kola içtim") intent yine log_drink olur, suyu amount_ml'ye yaz, su items'e girmez. meal_type boş bırak. Takviyeler (kreatin, protein tozu, BCAA vb.) log_drink DEĞİL, log_supplement'tir. İçecek bir yemekle aynı mesajdaysa ("tavuk yedim yanında ayran içtim") log_meal olarak hepsini items'e yaz.
- "su durumum", "ne kadar su içtim" → water_summary
- "85 kg tartıldım", "kilom 84.5" → log_weight (weight_kg: kg cinsinden)
- "kilo durumum", "son tartı" → weight_status
- "kreatin içtim", "2 kapsül omega 3 aldım", "takviye olarak ... aldım" → log_supplement (supplements: [{name, amount, category}] — category kuralları aşağıda)
- "bugün hangi takviyeleri aldım", "takviyelerim" → supplement_status
- "bench press 4x8 80kg yaptım", "squat 3x10 100kg", "30 dk koşu yaptım" → log_workout (exercises: [{name, sets, reps, weight_kg, duration_min, notes}], session_type: weights/cardio/mixed). Kardiyo aktivitelerinde (koşu, yürüyüş bandı, bisiklet vb.) hız, eğim, mesafe gibi detayları notes alanına Türkçe olarak yaz. Örnek: "30 dakika 15 eğim 3.5 hız yürüyüş bandı" → exercises: [{"name": "yürüyüş bandı", "duration_min": 30, "notes": "eğim 15, hız 3.5 km/s"}]
- "bugün antrenmanım nasıldı", "antrenman geçmişim", "dünkü antrenmanım", "bu hafta antrenmanlarım", "geçen hafta ne yaptım" → workout_history (date_range: "today"/"yesterday"/"this_week"/"last_week" — mesajda belirtilen döneme göre; belirtilmemişse "today")
- "son egzersizimi sil", "son antrenman kaydımı sil", "yanlış girdim antrenmanda" → delete_last_exercise
- "son su kaydımı sil", "yanlış su girdim", "su kaydımı iptal et" → delete_last_water
- "son kilo kaydımı sil", "yanlış kilo girdim", "kilo kaydımı iptal et" → delete_last_weight
- Kullanıcı çok günlü antrenman programını (hangi gün hangi hareketler, set/tekrar) tek mesajda paylaşırsa (örn. "programım: 1. gün push, bench press 4x8, omuz press 3x10. 2. gün pull, barfiks 4x8, row 4x8. 3. gün legs, squat 4x8. 4. gün dinlenme.") → set_program (program: [{day_number, day_label, exercises: [{name, sets, reps}]}] — day_number 1'den başlar ve sırayla artar, dinlenme günleri için day_label "Dinlenme" ve exercises: [] kullan. Kullanıcının belirttiği TÜM günleri diziye dahil et.)
- "yaşım 26 oldu", "boyum 178 cm", "cinsiyetimi değiştir", "artık çok aktifim", "aktivite seviyem değişti, orta aktifim", "hedefimi kilo almaya çevir", "hedefim kiloyu koruyup kas kazanmak" → update_profile (profile_updates: değişen alan(lar)ı içeren obje — age: sayı, height_cm: sayı, gender: "male"/"female", activity_level: "sedanter"/"hafif_aktif"/"orta_aktif"/"cok_aktif", goal_type: "kilo_verme"/"koruma"/"kilo_alma"/"rekompozisyon" (rekompozisyon = kiloyu koruyup kas kazanmak) — sadece mesajda geçen alanları ekle, diğerlerini boş bırak). Bu komut sonrasında hedefler otomatik yeniden hesaplanır.
- "profilim", "bilgilerim", "profil bilgilerimi göster" → show_profile
- "kalori hedefimi 2800 yap", "protein hedefimi 180 olarak güncelle" → update_goal (goal_updates: [{field: "kalori/protein/karb/yağ/su", value: sayı}])
- "hedeflerim ne", "hedeflerimi göster" → show_goals
- "bu hafta nasıl gitti", "haftalık rapor", "bu hafta", "haftam nasıl" → weekly_report
- "son öğünümü sil", "kahvaltımı sil", "akşam yediğim hamburgeri sil", "2 yumurtayı sil", "yediğim pilavı sil" → delete_meal (items: silinmesi istenen yiyecekler [{name, quantity, unit}] — name YALIN halde; quantity'yi SADECE kullanıcı açıkça bir sayı/miktar söylediyse doldur, söylemediyse 0 yap; belirli bir yiyecek söylenmediyse items: [] bırak. meal_type: kullanıcı öğün belirttiyse doldur, yoksa boş bırak)
- "bütün yemekleri sil", "bugün yediklerimin hepsini sil", "tüm öğünlerimi sil", "bugünkü yemek kayıtlarını sıfırla" → delete_day_meals
- "yanlış girdim", "aslında ... yedim", "düzelt", "hata yaptım ... yedim" → edit_meal (items: doğru öğün bilgisi, normal log_meal formatında)
- "belim 85 cm", "göğüs ölçüm 100, kol 35" → log_measurement (measurements: {waist_cm, chest_cm, arm_cm} — sadece mesajda geçen ölçüleri ekle, sayı olarak cm cinsinden)
- "ölçülerim nasıl", "vücut ölçülerim", "ölçüm durumum" → measurement_status
- "dünkü kahvaltımı tekrar ekle", "dün ne yediysem bugün de onu ekle", "son öğünümü tekrar ekle" → repeat_meal (meal_type: belirtilmişse "breakfast"/"lunch"/"dinner"/"snack", belirtilmemişse boş bırak; date_range: "yesterday"/"today" — belirtilmemişse "yesterday")
- "premium ol", "ücretli üye olmak istiyorum", "premium'a geçmek istiyorum", "nasıl üye olurum", "sınırsız kullanmak istiyorum" → upgrade_premium
- "planım ne", "premium miyim", "hesabım ne durumda", "üyeliğim ne zaman bitiyor" → show_plan
- "hesabımı sil", "üyeliğimi iptal et", "tüm verilerimi sil", "hesabımı kapatmak istiyorum", "botu bırakmak istiyorum, bilgilerimi silin" → delete_account (DİKKAT: yemek/öğün silme istekleri — "bütün yemekleri sil", "son öğünümü sil" dahil — ASLA delete_account DEĞİLDİR; delete_account sadece kullanıcı hesabından, üyeliğinden veya kişisel verilerinin tamamından bahsettiğinde kullanılır)
- diğer → unknown

Takviye (log_supplement) kuralları:
${SUPPLEMENT_CATEGORY_GUIDE}

Meal type: kahvaltı/sabah→breakfast, öğle/öğlen→lunch, akşam→dinner, ara öğün/atıştırmalık/atıştırma→snack.
ÖNEMLİ: meal_type'ı SADECE kullanıcı mesajında öğünü açıkça söylediyse doldur (örn. "kahvaltıda", "öğlen", "akşam yemeğinde", "atıştırmalık olarak"). Söylemediyse meal_type'ı boş string "" bırak. Saatten veya yiyeceğin türünden (örn. cips → atıştırmalık, menemen → kahvaltı) TAHMİN ETME.

items alanı ZORUNLU olarak şu formatta olmalı — başka alan adı KULLANMA:
{"name": "yemek adı", "quantity": sayı, "unit": "adet/gram/kg/dilim/kaşık/bardak/porsiyon"}
Örnek: "2 yumurta yedim" → items: [{"name": "yumurta", "quantity": 2, "unit": "adet"}], meal_type: ""
Örnek: "kahvaltıda 2 yumurta yedim" → items: [{"name": "yumurta", "quantity": 2, "unit": "adet"}], meal_type: "breakfast"
Örnek: "150 gram tavuk yedim" → items: [{"name": "tavuk", "quantity": 150, "unit": "gram"}]
Örnek: "1 kilo peynir yedim" → items: [{"name": "peynir", "quantity": 1, "unit": "kg"}]
"quantity" ve "unit" alanlarını ASLA atlama veya farklı isim kullanma (amount, count değil). Miktarı kullanıcının yazdığı gibi aktar, küçültme veya düzeltme yapma.

SADECE JSON döndür:
{
  "intent": "weekly_report",
  "meal_type": "",
  "amount_ml": 0,
  "weight_kg": 0,
  "session_type": "",
  "goal_updates": [],
  "supplements": [{"name": "", "amount": "", "category": ""}],
  "exercises": [],
  "items": [],
  "ambiguities": [],
  "program": [],
  "date_range": "today",
  "profile_updates": {},
  "measurements": {}
}
(supplements dizisi sadece log_supplement intent'inde doldurulur; diğer durumlarda boş dizi [] olmalı.)`,
        },
        { role: "user", content: message },
      ],
    }),
  });

  const data = await response.json();
  if (!data.choices || !data.choices[0]) {
    console.error("parseWithAI OpenAI response error:", JSON.stringify(data));
    throw new Error("OpenAI parse failed");
  }
  return JSON.parse(data.choices[0].message.content) as AIResponse;
}

// ── Haftalık Rapor ────────────────────────────────────────
async function handleWeeklyReport(
  supabase: ReturnType<typeof createClient>,
  profile: Record<string, unknown>
): Promise<string> {
  const today = getLocalDate();

  const todayDate = new Date(today);
  const weekAgo = new Date(todayDate);
  weekAgo.setDate(todayDate.getDate() - 6);
  const weekAgoStr = weekAgo.toISOString().split("T")[0];

  const [mealsData, waterData, weightData, workoutData] = await Promise.all([
    supabase.from("v_daily_totals").select("local_date, total_calories, total_protein")
      .eq("user_id", profile.id)
      .gte("local_date", weekAgoStr)
      .lte("local_date", today),
    supabase.from("v_daily_water").select("local_date, total_ml")
      .eq("user_id", profile.id)
      .gte("local_date", weekAgoStr)
      .lte("local_date", today),
    supabase.from("weight_logs").select("weight, local_date")
      .eq("user_id", profile.id)
      .gte("local_date", weekAgoStr)
      .lte("local_date", today)
      .order("local_date", { ascending: true }),
    supabase.from("workout_sessions").select("local_date")
      .eq("user_id", profile.id)
      .gte("local_date", weekAgoStr)
      .lte("local_date", today),
  ]);

  const meals = mealsData.data ?? [];
  const waters = waterData.data ?? [];
  const weights = weightData.data ?? [];
  const workouts = workoutData.data ?? [];

  const calorieGoal = (profile.calorie_goal as number) ?? 2800;
  const proteinGoal = (profile.protein_goal as number) ?? 180;
  const waterGoal = (profile.water_goal_ml as number) ?? 3000;

  let reply = `📈 HAFTALIK RAPOR\n(${weekAgoStr} – ${today})\n\n`;

  if (meals.length > 0) {
    const avgCalories = Math.round(meals.reduce((s, m) => s + Number(m.total_calories), 0) / meals.length);
    const avgProtein = Math.round(meals.reduce((s, m) => s + Number(m.total_protein), 0) / meals.length * 10) / 10;
    const calorieHit = meals.filter(m => Number(m.total_calories) >= calorieGoal * 0.9).length;

    reply += `🍽️ Beslenme (${meals.length}/7 gün kayıt)\n`;
    reply += `Ort. Kalori: ${avgCalories} Kcal (hedef: ${calorieGoal})\n`;
    reply += `Ort. Protein: ${avgProtein} g (hedef: ${proteinGoal})\n`;
    reply += `Hedefe ulaşılan gün: ${calorieHit}/${meals.length}\n\n`;
  } else {
    reply += `🍽️ Beslenme: Bu hafta kayıt yok\n\n`;
  }

  if (waters.length > 0) {
    const avgWater = Math.round(waters.reduce((s, w) => s + Number(w.total_ml), 0) / waters.length);
    const waterHit = waters.filter(w => Number(w.total_ml) >= waterGoal).length;
    reply += `💧 Su (${waters.length}/7 gün kayıt)\n`;
    reply += `Ort. Su: ${avgWater} ml (hedef: ${waterGoal})\n`;
    reply += `Hedefe ulaşılan gün: ${waterHit}/${waters.length}\n\n`;
  } else {
    reply += `💧 Su: Bu hafta kayıt yok\n\n`;
  }

  reply += `🏋️‍♂️ Antrenman: ${workouts.length}/7 gün\n\n`;

  if (weights.length >= 2) {
    const first = Number(weights[0].weight);
    const last = Number(weights[weights.length - 1].weight);
    const diff = Math.round((last - first) * 10) / 10;
    const arrow = diff > 0 ? "📈" : diff < 0 ? "📉" : "➡️";
    const sign = diff > 0 ? "+" : "";
    reply += `⚖️ Kilo: ${first} → ${last} kg (${arrow} ${sign}${diff} kg)\n\n`;
  } else if (weights.length === 1) {
    reply += `⚖️ Kilo: ${weights[0].weight} kg (tek ölçüm)\n\n`;
  } else {
    reply += `⚖️ Kilo: Bu hafta ölçüm yok\n\n`;
  }

  const score = [
    meals.length >= 5,
    waters.length >= 5,
    workouts.length >= 3,
  ].filter(Boolean).length;

  const ratings = ["💪 Haftana daha fazla odaklan!", "👍 İyi bir hafta!", "🔥 Harika bir hafta!"];
  reply += ratings[score] || ratings[0];

  return reply.trim();
}

// ── Hedef Güncelle (manuel override) ──────────────────────
async function handleUpdateGoal(
  supabase: ReturnType<typeof createClient>,
  profile: Record<string, unknown>,
  aiResult: AIResponse
): Promise<string> {
  const goalUpdates = aiResult.goal_updates ?? [];
  if (goalUpdates.length === 0) {
    return "Hangi hedefi güncellemek istediğini anlayamadım. Örn: 'kalori hedefimi 2800 yap'";
  }

  const update: Record<string, unknown> = {};
  const updated: string[] = [];

  for (const gu of goalUpdates) {
    const fieldKey = gu.field.toLowerCase().trim();
    const mapping = GOAL_FIELD_MAP[fieldKey];
    if (!mapping || !gu.value || gu.value <= 0) continue;
    const bounds = GOAL_FIELD_BOUNDS[mapping.column];
    if (bounds && (gu.value < bounds.min || gu.value > bounds.max)) continue;
    update[mapping.column] = gu.value;
    updated.push(`${mapping.label}: ${gu.value} ${mapping.unit}`);
  }

  if (Object.keys(update).length === 0) {
    return "Güncellenecek geçerli bir hedef bulunamadı. Örn: 'kalori hedefimi 2800 yap'";
  }

  await supabase.from("profiles").update(update).eq("id", profile.id);

  let reply = `✅ Hedefler güncellendi!\n\n`;
  for (const u of updated) reply += `${u}\n`;
  return reply.trim();
}

// ── Hedefleri Göster ─────────────────────────────────────
async function handleShowGoals(profile: Record<string, unknown>): Promise<string> {
  const calorieGoal = (profile.calorie_goal as number) ?? 2600;
  const proteinGoal = (profile.protein_goal as number) ?? 200;
  const carbsGoal = (profile.carbs_goal as number) ?? 280;
  const fatGoal = (profile.fat_goal as number) ?? 80;
  const waterGoal = (profile.water_goal_ml as number) ?? 2500;

  return `🎯 GÜNLÜK HEDEFLERİN\n\nKalori: ${calorieGoal} Kcal\nProtein: ${proteinGoal} g\nKarbonhidrat: ${carbsGoal} g\nYağ: ${fatGoal} g\n💧 Su: ${waterGoal} ml\n\nGüncellemek için: "kalori hedefimi 2800 yap"`;
}

// ── Profil Güncelle + Hedefleri Yeniden Hesapla ───────────
async function handleUpdateProfile(
  supabase: ReturnType<typeof createClient>,
  profile: Record<string, unknown>,
  aiResult: AIResponse
): Promise<string> {
  const updates = aiResult.profile_updates ?? {};
  const changed: string[] = [];
  const dbUpdate: Record<string, unknown> = {};

  if (typeof updates.age === "number" && updates.age >= 10 && updates.age <= 100) {
    dbUpdate.age = updates.age;
    changed.push(`Yaş: ${updates.age}`);
  }
  if (typeof updates.height_cm === "number" && updates.height_cm >= 70 && updates.height_cm <= 250) {
    dbUpdate.height_cm = updates.height_cm;
    changed.push(`Boy: ${updates.height_cm} cm`);
  }
  if (updates.gender === "male" || updates.gender === "female") {
    dbUpdate.gender = updates.gender;
    changed.push(`Cinsiyet: ${updates.gender === "male" ? "Erkek" : "Kadın"}`);
  }
  if (updates.activity_level && ACTIVITY_MAP[updates.activity_level]) {
    const act = ACTIVITY_MAP[updates.activity_level];
    dbUpdate.activity_level = act.level;
    dbUpdate.activity_multiplier = act.mult;
    changed.push(`Aktivite seviyesi: ${act.label}`);
  }
  if (updates.goal_type && GOAL_TYPE_LABELS[updates.goal_type]) {
    dbUpdate.goal_type = updates.goal_type;
    changed.push(`Hedef: ${GOAL_TYPE_LABELS[updates.goal_type]}`);
  }

  if (Object.keys(dbUpdate).length === 0) {
    return "Güncellemek istediğin profil bilgisini anlayamadım. Örn: 'yaşım 26 oldu' veya 'artık çok aktifim'";
  }

  await supabase.from("profiles").update(dbUpdate).eq("id", profile.id);

  const { data: freshProfile } = await supabase
    .from("profiles").select("age, height_cm, gender, activity_multiplier, goal_type")
    .eq("id", profile.id).single();
  const { data: latestWeight } = await supabase
    .from("weight_logs").select("weight")
    .eq("user_id", profile.id)
    .order("local_date", { ascending: false }).limit(1).maybeSingle();

  const age = (freshProfile?.age as number) ?? 25;
  const heightCm = (freshProfile?.height_cm as number) ?? 170;
  const gender = (freshProfile?.gender as string) ?? "male";
  const activityMult = (freshProfile?.activity_multiplier as number) ?? 1.375;
  const goalType = (freshProfile?.goal_type as string) ?? "koruma";
  const weightKg = latestWeight?.weight ? Number(latestWeight.weight) : 70;

  const { calorieGoal, proteinGoal, carbsGoal, fatGoal } = computeGoals(
    age, heightCm, gender, activityMult, weightKg, goalType
  );

  await supabase.from("profiles").update({
    calorie_goal: calorieGoal,
    protein_goal: proteinGoal,
    carbs_goal: carbsGoal,
    fat_goal: fatGoal,
  }).eq("id", profile.id);

  let reply = `✅ Profilin güncellendi!\n\n`;
  for (const c of changed) reply += `${c}\n`;
  reply += `\n🎯 Hedeflerin yeniden hesaplandı:\nKalori: ${calorieGoal} Kcal\nProtein: ${proteinGoal} g\nKarbonhidrat: ${carbsGoal} g\nYağ: ${fatGoal} g`;

  return reply;
}

// ── Profili Göster ─────────────────────────────────────────
async function handleShowProfile(
  supabase: ReturnType<typeof createClient>,
  profile: Record<string, unknown>
): Promise<string> {
  const { data: latestWeight } = await supabase
    .from("weight_logs").select("weight, local_date")
    .eq("user_id", profile.id)
    .order("local_date", { ascending: false }).limit(1).maybeSingle();

  const name = (profile.full_name as string) || "-";
  const age = profile.age ?? "-";
  const heightCm = profile.height_cm ?? "-";
  const genderLabel = profile.gender === "male" ? "Erkek" : profile.gender === "female" ? "Kadın" : "-";
  const activityLabel = profile.activity_level
    ? (ACTIVITY_MAP[profile.activity_level as string]?.label ?? String(profile.activity_level))
    : "-";
  const goalLabel = profile.goal_type ? (GOAL_TYPE_LABELS[profile.goal_type as string] ?? String(profile.goal_type)) : "-";
  const weight = latestWeight?.weight ? `${latestWeight.weight} kg (${latestWeight.local_date})` : "-";

  return `👤 PROFİLİN\n\nİsim: ${name}\nYaş: ${age}\nBoy: ${heightCm} cm\nCinsiyet: ${genderLabel}\nSon kilo: ${weight}\nAktivite seviyesi: ${activityLabel}\nHedef: ${goalLabel}\n\nGüncellemek için: "yaşım 26 oldu", "artık çok aktifim" gibi mesajlar yazabilirsin.`;
}

// ── Öğün Kayıt ───────────────────────────────────────────
// Önce tüm kalemler çözülür ve kontrol edilir; gerçekçi değilse hiçbir şey kaydedilmez.
async function handleLogMeal(
  supabase: ReturnType<typeof createClient>,
  profile: Record<string, unknown>,
  aiResult: AIResponse,
  mealTypeOverride?: string | null,
  localDateOverride?: string | null
): Promise<string> {
  const localDate = localDateOverride || getLocalDate();
  const mealType = mealTypeOverride || resolveMealType(aiResult.meal_type) || inferMealTypeFromHour();
  const items = (aiResult.items ?? []).filter((i) => i && i.name);

  if (items.length === 0) {
    return "Ne yediğini anlayamadım. Örn: '2 yumurta yedim' veya '150 gram tavuk yedim'";
  }

  // 1) Hızlı miktar kontrolü (internet araştırmasından önce)
  const quick = quickQuantityCheck(items);
  if (quick) return quick;

  // 2) Besinleri bul ve gramajları hesapla
  const resolved: ResolvedItem[] = [];
  const notFound: string[] = [];
  let researchNotified = false;
  const todayStr = getLocalDate();
  const userIsPremium = isPremiumActive(profile);
  const researchLimit = userIsPremium ? PREMIUM_RESEARCH_LIMIT : FREE_RESEARCH_LIMIT;
  let researchLimitHit = false;
  let researchCount = (profile.daily_research_date === todayStr) ? ((profile.daily_research_count as number) ?? 0) : 0;

  for (const item of items) {
    let { data: foods } = await supabase.rpc("search_food", {
      search_term: item.name, user_id_param: profile.id,
    });

    let servingGramsFromResearch: number | null = null;
    let researched = false;

    if (!foods || foods.length === 0) {
      if (researchCount >= researchLimit) {
        researchLimitHit = true;
        notFound.push(item.name);
        continue;
      }
      researchCount++;
      await supabase.from("profiles").update({
        daily_research_count: researchCount, daily_research_date: todayStr,
      }).eq("id", profile.id);

      if (!researchNotified && profile.phone_e164) {
        await sendWhatsAppMessage(profile.phone_e164 as string, `🔍 "${item.name}" veritabanımda yok, internetten araştırıyorum, birazdan sonucu göndereceğim...`);
        researchNotified = true;
      }
      const found = await researchFoodOnline(item.name, profile.id as string, supabase, item.unit);
      if (found) {
        foods = [found.food];
        researched = true;
        servingGramsFromResearch = found.servingGrams;
      } else {
        notFound.push(item.name);
        continue;
      }
    }

    const food = foods[0] as FoodRow;
    const q = Number(item.quantity) || 1;
    const u = normalizeChoice(String(item.unit ?? ""));
    let grams = q;
    if (isKgUnit(u) || isLiterUnit(u)) {
      grams = q * 1000;
    } else if (isMlUnit(u)) {
      grams = q; // içeceklerde 1 ml ≈ 1 g
    } else if (!isGramUnit(u)) {
      if (servingGramsFromResearch) {
        grams = q * servingGramsFromResearch;
      } else {
        const { data: portionData } = await supabase.rpc("get_food_portion", {
          food_id_param: food.id, unit_name_param: item.unit,
        });
        if (portionData) {
          grams = q * Number(portionData);
        } else {
          const estimated = await estimateServingGrams(food.name, item.unit);
          if (estimated) grams = q * estimated;
        }
      }
    }

    resolved.push({
      item, food, grams, researched,
      calories: (grams / 100) * Number(food.calories_per_100g),
      protein: (grams / 100) * Number(food.protein_per_100g),
      carbs: (grams / 100) * Number(food.carbs_per_100g),
      fat: (grams / 100) * Number(food.fat_per_100g),
    });
  }

  // 3) Gerçekçilik kontrolü (gramaj ve kalori çözüldükten sonra)
  const tooHeavy = resolved
    .filter((r) => r.grams > MAX_ITEM_GRAMS)
    .map((r) => `${r.food.name}: ~${Math.round(r.grams)} g`);
  if (tooHeavy.length > 0) return unrealisticReply(tooHeavy);

  const totalCalories = resolved.reduce((s, r) => s + r.calories, 0);
  if (totalCalories > MAX_MEAL_CALORIES) {
    return unrealisticReply([`Toplam: ~${Math.round(totalCalories)} Kcal`]);
  }

  if (resolved.length === 0) {
    if (researchLimitHit) {
      return `⚠️ Veritabanımda bulamadım: ${notFound.join(", ")}\n\n${researchLimitText(userIsPremium)}`;
    }
    return `⚠️ Bulamadım: ${notFound.join(", ")}\n\nFarklı bir isimle tekrar yazar mısın? (örn. marka yerine yemek adı)`;
  }

  const totalProtein = resolved.reduce((s, r) => s + r.protein, 0);
  const totalCarbs = resolved.reduce((s, r) => s + r.carbs, 0);
  const totalFat = resolved.reduce((s, r) => s + r.fat, 0);

  // 4) Kaydet
  const { data: meal, error: mealError } = await supabase
    .from("meals").insert({
      user_id: profile.id,
      meal_type: mealType,
      local_date: localDate,
      source: "whatsapp",
      total_calories: round1(totalCalories),
      total_protein: round1(totalProtein),
      total_carbs: round1(totalCarbs),
      total_fat: round1(totalFat),
    }).select().single();

  if (mealError || !meal) throw new Error("Öğün kaydedilemedi: " + mealError?.message);

  for (const r of resolved) {
    await supabase.from("meal_items").insert({
      meal_id: meal.id, food_id: r.food.id, food_name_snapshot: r.food.name,
      quantity: r.item.quantity, unit: r.item.unit, grams_resolved: round1(r.grams),
      calories: round1(r.calories), protein: round1(r.protein),
      carbs: round1(r.carbs), fat: round1(r.fat),
      confidence: r.researched ? "medium" : "high",
    });
  }

  // 5) Cevap
  const { data: daily } = await supabase
    .from("v_daily_totals").select("*")
    .eq("user_id", profile.id).eq("local_date", localDate).maybeSingle();

  const calorieGoal = (profile.calorie_goal as number) ?? 2600;
  const proteinGoal = (profile.protein_goal as number) ?? 200;
  const dailyCalories = Number(daily?.total_calories ?? totalCalories);
  const dailyProtein = Number(daily?.total_protein ?? totalProtein);

  const savedLabel = mealType === "drink" ? "İçecek" : (MEAL_TYPE_LABELS[mealType] ?? "Öğün");
  let reply = `${MEAL_TYPE_ICONS[mealType] ?? "🍽️"} ${savedLabel} kaydedildi\n\n`;
  for (const r of resolved) {
    reply += formatItemLine(r.food.name, r.item.quantity, r.item.unit, r.calories, r.protein, r.researched) + "\n";
  }
  reply += `\n🔥 Toplam: ${Math.round(totalCalories)} Kcal\n`;
  reply += `Protein: ${round1(totalProtein)} g\n`;
  reply += `Karbonhidrat: ${round1(totalCarbs)} g\n`;
  reply += `Yağ: ${round1(totalFat)} g\n`;
  reply += `\n📊 Bugün:\nKalori: ${Math.round(dailyCalories)} / ${calorieGoal} Kcal\n`;
  reply += `Protein: ${round1(dailyProtein)} / ${proteinGoal} g\n`;
  reply += `\n🎯 Kalan:\n${remainingText("Kalori", calorieGoal, dailyCalories, "Kcal")}\n`;
  reply += remainingText("Protein", proteinGoal, dailyProtein, "g");
  if (resolved.some((r) => r.researched)) reply += `\n\n🔍 = internetten araştırıldı`;
  if (notFound.length > 0) reply += `\n\n⚠️ Bulunamadı: ${notFound.join(", ")}`;
  if (researchLimitHit) reply += `\n${researchLimitText(userIsPremium)}`;

  const priorCalories = dailyCalories - totalCalories;
  const priorProtein = dailyProtein - totalProtein;

  if (priorCalories < calorieGoal && dailyCalories >= calorieGoal) {
    reply += `\n\n🔥 Günlük kalori hedefini tamamladın!`;
  }
  if (priorProtein < proteinGoal && dailyProtein >= proteinGoal) {
    reply += `\n\n💪 Günlük protein hedefini tamamladın!`;
  }

  return reply;
}

// ── Bugünkü öğünleri kalemleriyle birlikte getir ─────────────
async function getTodayMealsWithItems(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  localDate: string
): Promise<MealWithItems[]> {
  const { data, error } = await supabase
    .from("meals")
    .select("id, meal_type, created_at, total_calories, total_protein, total_carbs, total_fat, meal_items(id, meal_id, food_id, food_name_snapshot, quantity, unit, grams_resolved, calories, protein, carbs, fat)")
    .eq("user_id", userId)
    .eq("local_date", localDate)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("getTodayMealsWithItems error:", JSON.stringify(error));
    return [];
  }
  return (data ?? []) as unknown as MealWithItems[];
}

// ── Öğün toplamlarını kalemlerden yeniden hesapla (boşsa öğünü sil) ─
async function recomputeMealTotals(
  supabase: ReturnType<typeof createClient>,
  mealId: string
): Promise<void> {
  const { data: items } = await supabase
    .from("meal_items").select("calories, protein, carbs, fat").eq("meal_id", mealId);
  if (!items || items.length === 0) {
    await supabase.from("meals").delete().eq("id", mealId);
    return;
  }
  const sum = (k: string) => round1(items.reduce((s, i) => s + Number((i as Record<string, unknown>)[k] ?? 0), 0));
  await supabase.from("meals").update({
    total_calories: sum("calories"),
    total_protein: sum("protein"),
    total_carbs: sum("carbs"),
    total_fat: sum("fat"),
  }).eq("id", mealId);
}

// ── Öğünleri tipine göre grupla ve listele (her öğün için makrolarla) ─
function formatMealsByType(meals: MealWithItems[]): string {
  let out = "";
  for (const type of MEAL_TYPE_ORDER) {
    const group = meals.filter((m) => m.meal_type === type);
    if (group.length === 0) continue;
    out += `\n${MEAL_TYPE_ICONS[type]} ${MEAL_TYPE_LABELS[type]}\n`;
    out += `${macroLine(sumMeals(group))}\n`;
    for (const m of group) {
      for (const it of m.meal_items ?? []) {
        out += formatItemLine(it.food_name_snapshot, it.quantity, it.unit, Number(it.calories), it.protein) + "\n";
      }
    }
  }
  return out;
}

// ── Günlük kalori/protein durumu (kısa) ─────────────────────
async function dailyStatusText(
  supabase: ReturnType<typeof createClient>,
  profile: Record<string, unknown>,
  localDate: string
): Promise<string> {
  const { data: daily } = await supabase
    .from("v_daily_totals").select("total_calories, total_protein")
    .eq("user_id", profile.id).eq("local_date", localDate).maybeSingle();
  const calorieGoal = (profile.calorie_goal as number) ?? 2600;
  const proteinGoal = (profile.protein_goal as number) ?? 200;
  const cal = Number(daily?.total_calories ?? 0);
  const pro = Number(daily?.total_protein ?? 0);
  return `📊 Bugün:\nKalori: ${Math.round(cal)} / ${calorieGoal} Kcal\nProtein: ${round1(pro)} / ${proteinGoal} g`;
}

// ── Öğün / Yemek Sil (AI yedek yolu — asıl kurallar silme yönlendiricisinde) ──
async function handleDeleteMeal(
  supabase: ReturnType<typeof createClient>,
  profile: Record<string, unknown>,
  aiResult: AIResponse
): Promise<string> {
  const mealTypeFilter = resolveMealType(aiResult.meal_type);
  const targets = (aiResult.items ?? []).filter((i) => i && String(i.name ?? "").trim());
  if (targets.length > 0) return await handleNamedDelete(supabase, profile, targets, mealTypeFilter, "meal");
  if (mealTypeFilter) return await deleteMealsOfType(supabase, profile, mealTypeFilter);
  return await deleteLastMeal(supabase, profile);
}

// ── Bugünkü Tüm Öğünleri Sil ──────────────────────────────
async function handleDeleteDayMeals(
  supabase: ReturnType<typeof createClient>,
  profile: Record<string, unknown>
): Promise<string> {
  const localDate = getLocalDate();
  const meals = await getTodayMealsWithItems(supabase, profile.id as string, localDate);
  if (meals.length === 0) return "Bugün silinecek bir öğün kaydın yok.";

  const totalCal = meals.reduce((s, m) => s + Number(m.total_calories || 0), 0);
  const listing = formatMealsByType(meals);

  const { error } = await supabase.from("meals").delete()
    .eq("user_id", profile.id).eq("local_date", localDate);
  if (error) {
    console.error("handleDeleteDayMeals error:", JSON.stringify(error));
    return "⚠️ Öğünleri silerken bir sorun oluştu, lütfen tekrar dene.";
  }

  return `🗑️ Bugünkü tüm öğünlerin silindi (${meals.length} kayıt, ${Math.round(totalCal)} Kcal)\n${listing}`.trim();
}

// ── Öğün Düzelt ──────────────────────────────────────────
async function handleEditMeal(
  supabase: ReturnType<typeof createClient>,
  profile: Record<string, unknown>,
  aiResult: AIResponse
): Promise<string> {
  if (!aiResult.items || aiResult.items.length === 0) {
    return "Düzeltmek istediğin öğünü anlayamadım. Örn: 'yanlış girdim, 2 yumurta değil 3 yumurta yedim'";
  }

  const localDate = getLocalDate();
  const { data: lastMeal } = await supabase
    .from("meals").select("id, meal_type")
    .eq("user_id", profile.id).eq("local_date", localDate)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();

  if (lastMeal) {
    await supabase.from("meals").delete().eq("id", lastMeal.id);
  }

  // Kullanıcı öğün belirtmediyse düzeltilen öğünün tipini koru
  const override = resolveMealType(aiResult.meal_type) ?? (lastMeal?.meal_type as string | undefined) ?? null;
  const newReply = await handleLogMeal(supabase, profile, aiResult, override);
  return `✏️ Son öğün düzeltildi.\n\n${newReply}`;
}

// ── Program Kaydet ─────────────────────────────────────────
async function handleSetProgram(
  supabase: ReturnType<typeof createClient>,
  profile: Record<string, unknown>,
  aiResult: AIResponse
): Promise<string> {
  const program = aiResult.program ?? [];
  if (program.length === 0) {
    return "Programını anlayamadım. Örn: '1. gün push, bench press 4x8, omuz press 3x10. 2. gün pull, barfiks 4x8. 3. gün legs, squat 4x8. 4. gün dinlenme.'";
  }

  await supabase.from("workout_programs").delete().eq("user_id", profile.id);

  for (const day of program) {
    await supabase.from("workout_programs").insert({
      user_id: profile.id,
      day_number: day.day_number,
      day_label: day.day_label,
      exercises: day.exercises || [],
    });
  }

  await supabase.from("profiles").update({
    program_start_date: getLocalDate(),
    program_cycle_length: program.length,
  }).eq("id", profile.id);

  let reply = `✅ Programın kaydedildi! (${program.length} günlük döngü)\n\n`;
  for (const day of program) {
    reply += `${day.day_number}. Gün — ${day.day_label}\n`;
    if (day.exercises && day.exercises.length > 0) {
      for (const ex of day.exercises) {
        reply += `  • ${ex.name}`;
        if (ex.sets && ex.reps) reply += ` ${ex.sets}x${ex.reps}`;
        reply += `\n`;
      }
    } else {
      reply += `  (dinlenme)\n`;
    }
    reply += `\n`;
  }
  reply += `Her sabah o günün programını hatırlatacağım! 💪`;
  return reply.trim();
}

// ── Kardiyo kalori tahmini (MET tabanlı) ──────────────────
async function estimateCaloriesBurned(
  exerciseName: string, durationMin: number, notes: string, weightKg: number
): Promise<number | null> {
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `Sen bir egzersiz fizyolojisi uzmanısın. Verilen kardiyo aktivitesi için uygun MET (Metabolic Equivalent) değerini tahmin et. Hız, eğim, yoğunluk gibi detayları dikkate al. SADECE JSON döndür: {"met": 0}`,
          },
          { role: "user", content: `Aktivite: ${exerciseName}\nSüre: ${durationMin} dakika\nDetaylar: ${notes || "yok"}` },
        ],
      }),
    });
    const data = await response.json();
    const parsed = JSON.parse(data.choices[0].message.content);
    const met = typeof parsed.met === "number" && parsed.met > 0 ? parsed.met : null;
    if (!met) return null;
    const calories = (met * 3.5 * weightKg / 200) * durationMin;
    return Math.round(calories);
  } catch (err) {
    console.error("estimateCaloriesBurned error:", err);
    return null;
  }
}

// ── Porsiyon gramajı tahmini (hızlı, web araması yok) ─────
async function estimateServingGrams(foodName: string, unit: string): Promise<number | null> {
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `Türkiye'deki tipik porsiyon büyüklüklerini bil. Bir "${unit}" "${foodName}" yaklaşık kaç gram gelir? SADECE JSON döndür: {"grams": 0}`,
          },
          { role: "user", content: foodName },
        ],
      }),
    });
    const data = await response.json();
    const parsed = JSON.parse(data.choices[0].message.content);
    return (typeof parsed.grams === "number" && parsed.grams > 0) ? parsed.grams : null;
  } catch (err) {
    console.error("estimateServingGrams error:", err);
    return null;
  }
}

// ── Yardımcı: Günün saatine göre öğün tipi tahmini ────────
function istanbulHour(d: Date): number {
  const hourStr = new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul", hour: "2-digit", hour12: false,
  }).format(d);
  return parseInt(hourStr, 10);
}

function getLocalHour(): number {
  return istanbulHour(new Date());
}

function mealTypeForHour(hour: number): string {
  if (hour >= 5 && hour < 11) return "breakfast";
  if (hour >= 11 && hour < 16) return "lunch";
  if (hour >= 16 && hour < 22) return "dinner";
  return "snack";
}

function inferMealTypeFromHour(): string {
  return mealTypeForHour(getLocalHour());
}

// ── Base64 kodlama (görsel için) ──────────────────────────
function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

// ── Fotoğraftan yemek tanıma (vision) ─────────────────────
async function analyzeFoodImage(mediaId: string): Promise<MealItem[] | null> {
  try {
    const mediaInfoRes = await fetch(`https://graph.facebook.com/v18.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
    });
    const mediaInfo = await mediaInfoRes.json();
    const mediaUrl = mediaInfo.url;
    const mimeType = mediaInfo.mime_type || "image/jpeg";
    if (!mediaUrl) return null;

    const imageRes = await fetch(mediaUrl, {
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
    });
    const arrayBuffer = await imageRes.arrayBuffer();
    const base64 = encodeBase64(new Uint8Array(arrayBuffer));

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `Sen bir beslenme uzmanısın. Fotoğraftaki yiyecekleri SADECE net ve açıkça görünenleri Türkçe isimleriyle tanı, miktarını ve birimini tahmin et (adet/gram/dilim/kaşık/bardak/porsiyon). Yemek belirsizse, karanlıksa veya net değilse o öğeyi ekleme. Fotoğrafta hiç yiyecek yoksa veya hiçbiri net değilse items'i boş dizi [] yap. SADECE JSON döndür:
{"items": [{"name": "yemek adı", "quantity": sayı, "unit": "adet/gram/dilim/kaşık/bardak/porsiyon"}]}`,
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Bu fotoğraftaki yiyecekleri tanı." },
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
            ],
          },
        ],
      }),
    });

    const data = await response.json();
    if (!data.choices || !data.choices[0]) {
      console.error("analyzeFoodImage OpenAI response error:", JSON.stringify(data));
      return null;
    }
    const parsed = JSON.parse(data.choices[0].message.content);
    const items = parsed.items as MealItem[];
    if (!items || items.length === 0) return null;
    return items;
  } catch (err) {
    console.error("analyzeFoodImage error:", err);
    return null;
  }
}

// ── Sesli mesajı metne çevir (WhatsApp media + Whisper) ───
async function transcribeVoiceMessage(mediaId: string): Promise<string | null> {
  try {
    const mediaInfoRes = await fetch(`https://graph.facebook.com/v18.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
    });
    const mediaInfo = await mediaInfoRes.json();
    const mediaUrl = mediaInfo.url;
    if (!mediaUrl) return null;

    const audioRes = await fetch(mediaUrl, {
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
    });
    const audioBlob = await audioRes.blob();

    const formData = new FormData();
    formData.append("file", audioBlob, "audio.ogg");
    formData.append("model", "whisper-1");
    formData.append("language", "tr");

    const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: formData,
    });
    const whisperData = await whisperRes.json();
    return whisperData.text || null;
  } catch (err) {
    console.error("transcribeVoiceMessage error:", err);
    return null;
  }
}

// ── WhatsApp'a doğrudan mesaj gönder ──────────────────────
async function sendWhatsAppMessage(phone: string, text: string): Promise<void> {
  try {
    await fetch(`https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${WHATSAPP_TOKEN}` },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: phone,
        text: { body: text },
      }),
    });
  } catch (err) {
    console.error("sendWhatsAppMessage error:", err);
  }
}

// ── İnternetten besin araştır ─────────────────────────────
async function researchFoodOnline(
  foodName: string, userId: string,
  supabase: ReturnType<typeof createClient>,
  unit: string
): Promise<ResearchResult | null> {
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: "gpt-4o",
        tools: [{ type: "web_search_preview" }],
        input: `"${foodName}" için 100g başına besin değerlerini Türkiye kaynaklarından araştır. Ayrıca "${unit}" bir porsiyon/ölçü birimiyse (örn. tabak, porsiyon, kase, dilim, kaşık, bardak, adet), bir "${unit}" ${foodName}'in yaklaşık kaç grama geldiğini tahmin et (serving_grams). Eğer "${unit}" zaten gram/gr/g ise veya tahmin edilemiyorsa serving_grams'i 0 yap. SADECE JSON döndür:
{"name":"...","category":"...","calories_per_100g":0,"protein_per_100g":0,"carbs_per_100g":0,"fat_per_100g":0,"fiber_per_100g":0,"serving_grams":0}`,
      }),
    });

    const data = await response.json();
    const textContent = (data.output ?? [])
      .filter((i: { type: string }) => i.type === "message")
      .flatMap((i: { content: { type: string; text: string }[] }) => i.content)
      .filter((c: { type: string }) => c.type === "output_text")
      .map((c: { text: string }) => c.text).join("");

    if (!textContent) return null;
    const match = textContent.match(/\{[\s\S]*?\}/);
    if (!match) return null;
    const est = JSON.parse(match[0]);

    const { data: savedFood, error } = await supabase.from("foods").insert({
      name: est.name || foodName, category: est.category || "Diğer",
      calories_per_100g: est.calories_per_100g ?? 0, protein_per_100g: est.protein_per_100g ?? 0,
      carbs_per_100g: est.carbs_per_100g ?? 0, fat_per_100g: est.fat_per_100g ?? 0,
      fiber_per_100g: est.fiber_per_100g ?? 0,
      source: "local_db", is_verified: false, user_id: userId,
    }).select().single();

    if (error || !savedFood) return null;

    const servingGrams = (typeof est.serving_grams === "number" && est.serving_grams > 0) ? est.serving_grams : null;

    return { food: savedFood as FoodRow, servingGrams };
  } catch (err) {
    console.error("researchFoodOnline error:", err);
    return null;
  }
}

// ── Su Kayıt ─────────────────────────────────────────────
// ── İçecekler (su hariç) ─────────────────────────────────
// Düz su mu? "meyve suyu", "portakal suyu", "maden suyu" gibi içecekler su sayılmaz.
function isPlainWater(text: string): boolean {
  const t = normalizeChoice(text ?? "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ");
  const cleaned = t.replace(/(meyve|portakal|salgam|nar|elma|visne|seftali|kayisi|domates|maden|limon|havuc|ananas|karpuz|uzum|mandalina|greyfurt|cilek|kavun|hindistan cevizi|aloe vera|vitaminli) suy\w*/g, " ");
  return /(^|\s)(su|suyu|suyum|suyumu|sulari|water)(\s|$)/.test(cleaned);
}

async function parseDrinkItems(text: string): Promise<MealItem[]> {
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `Kullanıcının içtiği içecekleri (su HARİÇ) ayıkla. İsimleri yalın ve genel yaz (örn. "kolayı" → "kola", "coca cola" → "kola", "maden suyu" → "soda"). Birim: ml, litre, bardak, kutu, şişe, fincan, kupa. Miktarı kullanıcının yazdığı gibi aktar; miktar yoksa quantity 1, unit "bardak" yap. SADECE JSON döndür: {"items": [{"name": "", "quantity": 0, "unit": ""}]}`,
          },
          { role: "user", content: text },
        ],
      }),
    });
    const data = await response.json();
    if (!data.choices || !data.choices[0]) return [];
    const parsed = JSON.parse(data.choices[0].message.content);
    return ((parsed.items ?? []) as MealItem[]).filter((i) => i && String(i.name ?? "").trim());
  } catch (err) {
    console.error("parseDrinkItems error:", err);
    return [];
  }
}

// İçecekleri "İçecekler" kategorisinde kaydeder; mesajda düz su da varsa onu su kaydına yazar
async function handleLogDrink(
  supabase: ReturnType<typeof createClient>,
  profile: Record<string, unknown>,
  aiResult: AIResponse
): Promise<string> {
  const items = (aiResult.items ?? []).filter((i) => i && String(i.name ?? "").trim());
  const parts: string[] = [];
  if ((aiResult.amount_ml ?? 0) > 0) {
    parts.push(await handleLogWater(supabase, profile, aiResult));
  }
  if (items.length > 0) {
    parts.push(await handleLogMeal(supabase, profile, { ...aiResult, items } as AIResponse, "drink"));
  }
  if (parts.length === 0) {
    return "Ne içtiğini anlayamadım. Örn: '1 kutu kola içtim', '1 bardak ayran içtim'";
  }
  return parts.join("\n\n");
}

async function handleLogWater(
  supabase: ReturnType<typeof createClient>,
  profile: Record<string, unknown>,
  aiResult: AIResponse
): Promise<string> {
  const localDate = getLocalDate();
  const amountMl = aiResult.amount_ml ?? 0;
  if (!amountMl || amountMl < 1 || amountMl > 5000) return "Kaç ml su içtiğini anlayamadım ya da girdiğin değer gerçekçi değil (1-5000 ml arası olmalı). Örn: '500 ml su içtim'";

  await supabase.from("water_logs").insert({
    user_id: profile.id, amount_ml: amountMl, local_date: localDate, source: "whatsapp",
  });

  const { data: daily } = await supabase
    .from("v_daily_water").select("*")
    .eq("user_id", profile.id).eq("local_date", localDate).single();

  const waterGoal = (profile.water_goal_ml as number) ?? 2500;
  const totalMl = daily?.total_ml ?? amountMl;
  const remaining = Math.max(0, waterGoal - totalMl);
  const percentage = Math.min(100, Math.round((totalMl / waterGoal) * 100));

  let reply = `💧 Su kaydedildi: ${amountMl} ml\n\n`;
  reply += `📊 Bugün: ${totalMl} / ${waterGoal} ml (${percentage}%)\n`;
  reply += remaining > 0 ? `🎯 Kalan: ${remaining} ml` : `✅ Günlük su hedefine ulaştın!`;

  const priorMl = totalMl - amountMl;
  if (priorMl < waterGoal && totalMl >= waterGoal) {
    reply += `\n\n💧 Günlük su hedefini tamamladın!`;
  }

  return reply;
}

// ── Su Özeti ─────────────────────────────────────────────
async function handleWaterSummary(
  supabase: ReturnType<typeof createClient>,
  profile: Record<string, unknown>
): Promise<string> {
  const localDate = getLocalDate();
  const { data: daily } = await supabase
    .from("v_daily_water").select("*")
    .eq("user_id", profile.id).eq("local_date", localDate).single();

  const waterGoal = (profile.water_goal_ml as number) ?? 2500;
  if (!daily) return `💧 Bugün henüz su kaydın yok.\nHedefin: ${waterGoal} ml`;

  const totalMl = daily.total_ml;
  const remaining = Math.max(0, waterGoal - totalMl);
  const percentage = Math.min(100, Math.round((totalMl / waterGoal) * 100));

  let reply = `💧 BUGÜN SU\n\nİçilen: ${totalMl} / ${waterGoal} ml\nİlerleme: ${percentage}%\n`;
  reply += remaining > 0 ? `\n🎯 Kalan: ${remaining} ml` : `\n✅ Günlük su hedefine ulaştın!`;
  return reply;
}

// ── Kilo Kayıt ───────────────────────────────────────────
async function handleLogWeight(
  supabase: ReturnType<typeof createClient>,
  profile: Record<string, unknown>,
  aiResult: AIResponse
): Promise<string> {
  const localDate = getLocalDate();
  const weightKg = aiResult.weight_kg ?? 0;
  if (!weightKg || weightKg < 20 || weightKg > 400) return "Kilonu anlayamadım ya da girdiğin değer gerçekçi değil (20-400 kg arası olmalı). Örn: '85 kg tartıldım'";

  const { data: existing } = await supabase
    .from("weight_logs").select("id")
    .eq("user_id", profile.id).eq("local_date", localDate).maybeSingle();

  if (existing) {
    await supabase.from("weight_logs").update({ weight: weightKg }).eq("id", existing.id);
  } else {
    await supabase.from("weight_logs").insert({
      user_id: profile.id, weight: weightKg, local_date: localDate,
    });
  }

  const { data: previous } = await supabase
    .from("weight_logs").select("weight, local_date")
    .eq("user_id", profile.id).lt("local_date", localDate)
    .order("local_date", { ascending: false }).limit(1).maybeSingle();

  let reply = `⚖️ Kilo kaydedildi: ${weightKg} kg\n`;
  if (previous) {
    const diff = Math.round((weightKg - Number(previous.weight)) * 10) / 10;
    const arrow = diff > 0 ? "📈" : diff < 0 ? "📉" : "➡️";
    const sign = diff > 0 ? "+" : "";
    reply += `${arrow} Önceki kayıt: ${previous.weight} kg (${sign}${diff} kg)`;
  }
  return reply;
}

// ── Kilo Durumu ──────────────────────────────────────────
async function handleWeightStatus(
  supabase: ReturnType<typeof createClient>,
  profile: Record<string, unknown>
): Promise<string> {
  const { data: logs } = await supabase
    .from("weight_logs").select("weight, local_date")
    .eq("user_id", profile.id)
    .order("local_date", { ascending: false }).limit(7);

  if (!logs || logs.length === 0) return "⚖️ Henüz kilo kaydın yok. Kaydetmek için: '85 kg tartıldım'";

  const latest = logs[0];
  let reply = `⚖️ KİLO DURUMU\n\nSon kayıt: ${latest.weight} kg (${latest.local_date})\n`;

  if (logs.length > 1) {
    const oldest = logs[logs.length - 1];
    const diff = Math.round((Number(latest.weight) - Number(oldest.weight)) * 10) / 10;
    const arrow = diff > 0 ? "📈" : diff < 0 ? "📉" : "➡️";
    const sign = diff > 0 ? "+" : "";
    reply += `\n📊 Son ${logs.length} kayıt:\n`;
    for (const log of [...logs].reverse()) {
      reply += `${log.local_date}: ${log.weight} kg\n`;
    }
    reply += `\n${arrow} Değişim: ${sign}${diff} kg`;
  }
  return reply;
}

// ── Vücut Ölçüsü Kayıt ─────────────────────────────────────
async function handleLogMeasurement(
  supabase: ReturnType<typeof createClient>,
  profile: Record<string, unknown>,
  aiResult: AIResponse
): Promise<string> {
  const localDate = getLocalDate();
  const m = aiResult.measurements ?? {};
  const fields: Record<string, number> = {};
  if (typeof m.waist_cm === "number" && m.waist_cm > 0 && m.waist_cm < 300) fields.waist_cm = m.waist_cm;
  if (typeof m.chest_cm === "number" && m.chest_cm > 0 && m.chest_cm < 300) fields.chest_cm = m.chest_cm;
  if (typeof m.arm_cm === "number" && m.arm_cm > 0 && m.arm_cm < 100) fields.arm_cm = m.arm_cm;

  if (Object.keys(fields).length === 0) {
    return "Hangi ölçünü kaydetmek istediğini anlayamadım. Örn: 'belim 85 cm' veya 'göğüs ölçüm 100, kol 35'";
  }

  const { data: existing } = await supabase
    .from("body_measurements").select("id")
    .eq("user_id", profile.id).eq("local_date", localDate).maybeSingle();

  if (existing) {
    await supabase.from("body_measurements").update(fields).eq("id", existing.id);
  } else {
    await supabase.from("body_measurements").insert({
      user_id: profile.id, local_date: localDate, ...fields,
    });
  }

  let reply = `📏 Ölçü kaydedildi\n\n`;
  if (fields.waist_cm) reply += `Bel: ${fields.waist_cm} cm\n`;
  if (fields.chest_cm) reply += `Göğüs: ${fields.chest_cm} cm\n`;
  if (fields.arm_cm) reply += `Kol: ${fields.arm_cm} cm\n`;
  return reply.trim();
}

// ── Vücut Ölçüsü Durumu ────────────────────────────────────
async function handleMeasurementStatus(
  supabase: ReturnType<typeof createClient>,
  profile: Record<string, unknown>
): Promise<string> {
  const { data: logs } = await supabase
    .from("body_measurements").select("waist_cm, chest_cm, arm_cm, local_date")
    .eq("user_id", profile.id)
    .order("local_date", { ascending: false }).limit(5);

  if (!logs || logs.length === 0) return "📏 Henüz ölçü kaydın yok. Kaydetmek için: 'belim 85 cm'";

  const latest = logs[0];
  let reply = `📏 ÖLÇÜ DURUMU\n\nSon ölçüm (${latest.local_date}):\n`;
  if (latest.waist_cm) reply += `Bel: ${latest.waist_cm} cm\n`;
  if (latest.chest_cm) reply += `Göğüs: ${latest.chest_cm} cm\n`;
  if (latest.arm_cm) reply += `Kol: ${latest.arm_cm} cm\n`;

  if (logs.length > 1) {
    const oldest = logs[logs.length - 1];
    if (latest.waist_cm && oldest.waist_cm) {
      const diff = Math.round((Number(latest.waist_cm) - Number(oldest.waist_cm)) * 10) / 10;
      const sign = diff > 0 ? "+" : "";
      reply += `\n📊 Bel değişimi (${logs.length} ölçüm): ${sign}${diff} cm`;
    }
  }
  return reply.trim();
}

// ── Öğün Tekrar Ekle (geçmişten kopyala) ───────────────────
async function handleRepeatMeal(
  supabase: ReturnType<typeof createClient>,
  profile: Record<string, unknown>,
  aiResult: AIResponse
): Promise<string> {
  const today = getLocalDate();
  const todayDate = new Date(today);
  let sourceDate = today;
  if ((aiResult.date_range || "yesterday") !== "today") {
    const y = new Date(todayDate);
    y.setDate(y.getDate() - 1);
    sourceDate = y.toISOString().split("T")[0];
  }

  const mealTypeFilter = resolveMealType(aiResult.meal_type);

  let query = supabase.from("meals").select("id, meal_type, total_calories, total_protein, total_carbs, total_fat")
    .eq("user_id", profile.id).eq("local_date", sourceDate)
    .order("created_at", { ascending: false }).limit(1);
  if (mealTypeFilter) query = query.eq("meal_type", mealTypeFilter);

  const { data: sourceMeal } = await query.maybeSingle();

  if (!sourceMeal) {
    const dayLabel = sourceDate === today ? "Bugünkü" : "Dünkü";
    return `${dayLabel} ${mealTypeFilter ? "o türde " : ""}bir öğün kaydın bulunamadı.`;
  }

  const { data: sourceItems } = await supabase
    .from("meal_items").select("food_id, food_name_snapshot, quantity, unit, grams_resolved, calories, protein, carbs, fat, confidence")
    .eq("meal_id", sourceMeal.id);

  if (!sourceItems || sourceItems.length === 0) {
    return "Kopyalanacak öğün bulundu ama içinde kayıtlı yemek yok.";
  }

  const { data: newMeal, error: mealError } = await supabase
    .from("meals").insert({
      user_id: profile.id, meal_type: sourceMeal.meal_type,
      local_date: today, source: "whatsapp",
      total_calories: sourceMeal.total_calories, total_protein: sourceMeal.total_protein,
      total_carbs: sourceMeal.total_carbs, total_fat: sourceMeal.total_fat,
    }).select().single();

  if (mealError || !newMeal) throw new Error("Öğün kopyalanamadı: " + mealError?.message);

  for (const item of sourceItems) {
    await supabase.from("meal_items").insert({
      meal_id: newMeal.id, food_id: item.food_id, food_name_snapshot: item.food_name_snapshot,
      quantity: item.quantity, unit: item.unit, grams_resolved: item.grams_resolved,
      calories: item.calories, protein: item.protein, carbs: item.carbs, fat: item.fat,
      confidence: item.confidence,
    });
  }

  const label = MEAL_TYPE_LABELS[sourceMeal.meal_type as string] ?? "Öğün";
  let reply = `🔁 ${label} tekrar eklendi\n\n`;
  for (const item of sourceItems) {
    reply += formatItemLine(item.food_name_snapshot as string, item.quantity, item.unit, Number(item.calories), item.protein) + "\n";
  }
  reply += `\n🔥 Toplam: ${Math.round(Number(sourceMeal.total_calories))} Kcal | Protein: ${round1(Number(sourceMeal.total_protein))} g\n\n`;
  reply += await dailyStatusText(supabase, profile, today);
  return reply;
}

// ── Premium'a Geçiş Bilgisi ──────────────────────
function handleUpgradePremium(): string {
  return `✨ SporTakip Premium\n\n` +
    `• Sınırsız mesaj (günlük limit yok)\n` +
    `• Sınırsız yemek fotoğrafı tanıma\n` +
    `• Günde ${PREMIUM_RESEARCH_LIMIT} internetten besin araştırma (ücretsiz planda ${FREE_RESEARCH_LIMIT})\n` +
    `• Proaktif hatırlatmalar (sabah antrenman programı, su/takviye/kilo hatırlatmaları, seri kutlamaları, otomatik haftalık rapor)\n\n` +
    `💳 Fiyat: ₺79/ay\n\n` +
    `Ödeme linki: [IYZICO_LINK_BURAYA]\n\n` +
    `Ödeme sonrası hesabın birkaç saat içinde aktif edilecek.`;
}

// ── Plan Durumunu Göster ───────────────────────────
function handleShowPlan(profile: Record<string, unknown>): string {
  const premium = isPremiumActive(profile);
  if (!premium) {
    return `📋 Planın: Ücretsiz (Free)\n\nSınırsız kullanım ve hatırlatmalar için premium'a geçebilirsin: "premium ol" yaz.`;
  }
  const until = profile.premium_until as string | null;
  return `📋 Planın: Premium ✨\n\n${until ? `Geçerlilik: ${until} tarihine kadar` : "Süresiz"}`;
}

// ── Takviye Kayıt (sadece geçerli takviyeler) ───────────────────
async function handleLogSupplement(
  supabase: ReturnType<typeof createClient>,
  profile: Record<string, unknown>,
  aiResult: AIResponse
): Promise<string> {
  const localDate = getLocalDate();
  const supplements = (aiResult.supplements ?? []).filter((s) => s && String(s.name ?? "").trim());
  if (supplements.length === 0) return "Hangi takviyeyi aldığını anlayamadım. Örn: 'kreatin içtim'";

  const accepted: SupplementItem[] = [];
  const rejected: string[] = [];
  for (const s of supplements) {
    const reason = supplementRejectReason(s);
    if (reason) rejected.push(`${s.name}: ${reason}`);
    else accepted.push(s);
  }

  if (accepted.length === 0) {
    console.warn(`Takviye reddedildi (user ${profile.id}): ${rejected.join(" | ")}`);
    return supplementRejectReply(rejected);
  }

  const saved: string[] = [];
  for (const supp of accepted) {
    await supabase.from("supplement_logs").insert({
      user_id: profile.id, supplement_name: supp.name,
      amount: supp.amount || null, local_date: localDate,
    });
    saved.push(supp.amount ? `${supp.name} (${supp.amount})` : supp.name);
  }

  const { data: todayLogs } = await supabase
    .from("supplement_logs").select("supplement_name, amount")
    .eq("user_id", profile.id).eq("local_date", localDate)
    .order("taken_at", { ascending: true });

  let reply = `💊 Takviye kaydedildi: ${saved.join(", ")}\n\n📋 Bugün Alınan Takviyeler:\n`;
  if (todayLogs) {
    for (const log of todayLogs) {
      reply += `• ${log.supplement_name}${log.amount ? " (" + log.amount + ")" : ""}\n`;
    }
  }
  if (rejected.length > 0) {
    reply += `\n⚠️ Kaydedilmedi:\n${rejected.map((r) => `• ${r}`).join("\n")}`;
  }
  return reply.trim();
}

// ── Takviye Durumu ────────────────────────────────────────
async function handleSupplementStatus(
  supabase: ReturnType<typeof createClient>,
  profile: Record<string, unknown>
): Promise<string> {
  const localDate = getLocalDate();
  const { data: logs } = await supabase
    .from("supplement_logs").select("supplement_name, amount")
    .eq("user_id", profile.id).eq("local_date", localDate)
    .order("taken_at", { ascending: true });

  if (!logs || logs.length === 0) return "💊 Bugün henüz takviye kaydın yok.";

  let reply = `💊 BUGÜN TAKVİYELER\n\n`;
  for (const log of logs) {
    reply += `• ${log.supplement_name}${log.amount ? " (" + log.amount + ")" : ""}\n`;
  }
  return reply.trim();
}

// ── Antrenman Kayıt ───────────────────────────────────────
async function handleLogWorkout(
  supabase: ReturnType<typeof createClient>,
  profile: Record<string, unknown>,
  aiResult: AIResponse
): Promise<string> {
  const localDate = getLocalDate();
  const exercises = aiResult.exercises ?? [];
  if (exercises.length === 0) {
    return "Antrenmanı anlayamadım. Örn: 'bench press 4x8 80kg yaptım' veya '30 dk koşu yaptım'";
  }

  const sessionType = aiResult.session_type || "weights";

  let { data: session } = await supabase
    .from("workout_sessions").select("id")
    .eq("user_id", profile.id).eq("local_date", localDate)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();

  if (!session) {
    const { data: newSession, error: sessionError } = await supabase
      .from("workout_sessions").insert({
        user_id: profile.id, local_date: localDate,
        session_type: sessionType, source: "whatsapp",
      }).select().single();
    if (sessionError || !newSession) throw new Error("Seans kaydedilemedi");
    session = newSession;
  }

  const { data: lastWeight } = await supabase
    .from("weight_logs").select("weight")
    .eq("user_id", profile.id)
    .order("local_date", { ascending: false }).limit(1).maybeSingle();
  const userWeightKg = lastWeight?.weight ? Number(lastWeight.weight) : 75;

  const saved: string[] = [];
  for (const ex of exercises) {
    let caloriesBurned: number | null = null;
    if (ex.duration_min && ex.duration_min > 0) {
      caloriesBurned = await estimateCaloriesBurned(ex.name, ex.duration_min, ex.notes || "", userWeightKg);
    }

    await supabase.from("workout_exercises").insert({
      session_id: session.id, exercise_name: ex.name,
      sets: ex.sets || null, reps: ex.reps ? String(ex.reps) : null,
      weight_kg: ex.weight_kg || null, duration_min: ex.duration_min || null,
      notes: ex.notes || null,
      calories_burned: caloriesBurned,
    });

    let desc = ex.name;
    if (ex.sets && ex.reps) desc += ` ${ex.sets}x${ex.reps}`;
    if (ex.weight_kg) desc += ` ${ex.weight_kg}kg`;
    if (ex.duration_min) desc += ` ${ex.duration_min}dk`;
    if (caloriesBurned) desc += ` (~${caloriesBurned} Kcal)`;
    saved.push(desc);
  }

  let reply = `🏋️‍♂️ Antrenman kaydedildi!\n\n`;
  for (const s of saved) reply += `• ${s}\n`;
  reply += `\nDevam eklemek için yeni egzersizleri yazabilirsin.`;
  return reply.trim();
}

// ── Son Egzersizi Sil ──────────────────────────────────────
async function handleDeleteLastExercise(
  supabase: ReturnType<typeof createClient>,
  profile: Record<string, unknown>
): Promise<string> {
  const localDate = getLocalDate();

  const { data: session } = await supabase
    .from("workout_sessions").select("id")
    .eq("user_id", profile.id).eq("local_date", localDate)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();

  if (!session) return "Bugün silinecek bir antrenman kaydın yok.";

  const { data: lastExercise } = await supabase
    .from("workout_exercises").select("id, exercise_name")
    .eq("session_id", session.id)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();

  if (!lastExercise) return "Bugün silinecek bir egzersiz kaydın yok.";

  await supabase.from("workout_exercises").delete().eq("id", lastExercise.id);

  return `🗑️ "${lastExercise.exercise_name}" egzersizi kaydından kaldırıldı.`;
}

// ── Son Su Kaydını Sil ─────────────────────────────────────
async function handleDeleteLastWater(
  supabase: ReturnType<typeof createClient>,
  profile: Record<string, unknown>
): Promise<string> {
  const localDate = getLocalDate();

  const { data: lastEntry } = await supabase
    .from("water_logs").select("id, amount_ml")
    .eq("user_id", profile.id).eq("local_date", localDate)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();

  if (!lastEntry) return "Bugün silinecek bir su kaydın yok.";

  await supabase.from("water_logs").delete().eq("id", lastEntry.id);

  return `🗑️ Son su kaydı silindi (${lastEntry.amount_ml} ml).`;
}

// ── Son Kilo Kaydını Sil ────────────────────────────────────
async function handleDeleteLastWeight(
  supabase: ReturnType<typeof createClient>,
  profile: Record<string, unknown>
): Promise<string> {
  const localDate = getLocalDate();

  const { data: entry } = await supabase
    .from("weight_logs").select("id, weight")
    .eq("user_id", profile.id).eq("local_date", localDate).maybeSingle();

  if (!entry) return "Bugün silinecek bir kilo kaydın yok.";

  await supabase.from("weight_logs").delete().eq("id", entry.id);

  return `🗑️ Bugünkü kilo kaydı silindi (${entry.weight} kg).`;
}

// ── Antrenman Geçmişi ─────────────────────────────────────
async function handleWorkoutHistory(
  supabase: ReturnType<typeof createClient>,
  profile: Record<string, unknown>,
  dateRange: string
): Promise<string> {
  const today = getLocalDate();
  const todayDate = new Date(today);

  let startDate: string;
  let endDate: string;
  let label: string;

  if (dateRange === "yesterday") {
    const y = new Date(todayDate);
    y.setDate(y.getDate() - 1);
    startDate = endDate = y.toISOString().split("T")[0];
    label = "DÜN";
  } else if (dateRange === "this_week") {
    const dayOfWeek = todayDate.getDay() === 0 ? 7 : todayDate.getDay();
    const monday = new Date(todayDate);
    monday.setDate(todayDate.getDate() - (dayOfWeek - 1));
    startDate = monday.toISOString().split("T")[0];
    endDate = today;
    label = "BU HAFTA";
  } else if (dateRange === "last_week") {
    const dayOfWeek = todayDate.getDay() === 0 ? 7 : todayDate.getDay();
    const thisMonday = new Date(todayDate);
    thisMonday.setDate(todayDate.getDate() - (dayOfWeek - 1));
    const lastMonday = new Date(thisMonday);
    lastMonday.setDate(thisMonday.getDate() - 7);
    const lastSunday = new Date(thisMonday);
    lastSunday.setDate(thisMonday.getDate() - 1);
    startDate = lastMonday.toISOString().split("T")[0];
    endDate = lastSunday.toISOString().split("T")[0];
    label = "GEÇEN HAFTA";
  } else {
    startDate = endDate = today;
    label = "BUGÜN";
  }

  const { data: sessions } = await supabase
    .from("workout_sessions").select("id, local_date, session_type")
    .eq("user_id", profile.id)
    .gte("local_date", startDate).lte("local_date", endDate)
    .order("local_date", { ascending: true });

  if (!sessions || sessions.length === 0) {
    return `🏋️‍♂️ ${label} için antrenman kaydın yok.`;
  }

  let reply = `🏋️‍♂️ ${label} ANTRENMAN\n\n`;

  for (const session of sessions) {
    const { data: exercises } = await supabase
      .from("workout_exercises").select("*")
      .eq("session_id", session.id)
      .order("created_at", { ascending: true });

    if (!exercises || exercises.length === 0) continue;

    if (startDate !== endDate) {
      reply += `📅 ${session.local_date}\n`;
    }

    for (const ex of exercises) {
      reply += `• ${ex.exercise_name}`;
      if (ex.sets && ex.reps) reply += ` ${ex.sets}x${ex.reps}`;
      if (ex.weight_kg) reply += ` ${ex.weight_kg}kg`;
      if (ex.duration_min) reply += ` ${ex.duration_min}dk`;
      if (ex.calories_burned) reply += ` (~${Math.round(Number(ex.calories_burned))} Kcal)`;
      reply += `\n`;
    }
    reply += `\n`;
  }

  return reply.trim();
}

// ── Günlük Özet (öğün bazlı makrolarla) ────────────────────────
async function handleDailySummary(
  supabase: ReturnType<typeof createClient>,
  profile: Record<string, unknown>
): Promise<string> {
  const localDate = getLocalDate();

  const [dailyMeals, dailyWater, workoutSession, supplementLogs, mealRowsRes] = await Promise.all([
    supabase.from("v_daily_totals").select("*")
      .eq("user_id", profile.id).eq("local_date", localDate).maybeSingle(),
    supabase.from("v_daily_water").select("*")
      .eq("user_id", profile.id).eq("local_date", localDate).maybeSingle(),
    supabase.from("workout_sessions").select("id")
      .eq("user_id", profile.id).eq("local_date", localDate).limit(1).maybeSingle(),
    supabase.from("supplement_logs").select("supplement_name")
      .eq("user_id", profile.id).eq("local_date", localDate),
    supabase.from("meals").select("meal_type, total_calories, total_protein, total_carbs, total_fat")
      .eq("user_id", profile.id).eq("local_date", localDate),
  ]);

  const daily = dailyMeals.data;
  const water = dailyWater.data;
  const workout = workoutSession.data;
  const supps = supplementLogs.data ?? [];
  const mealRows = (mealRowsRes.data ?? []) as { meal_type: string; total_calories: number; total_protein: number; total_carbs: number; total_fat: number }[];

  const calorieGoal = (profile.calorie_goal as number) ?? 2600;
  const proteinGoal = (profile.protein_goal as number) ?? 200;
  const carbsGoal = (profile.carbs_goal as number) ?? 280;
  const fatGoal = (profile.fat_goal as number) ?? 80;
  const waterGoal = (profile.water_goal_ml as number) ?? 2500;

  let reply = `📊 BUGÜN ÖZET\n\n`;

  if (daily) {
    reply += `🍽️ Beslenme\n`;
    reply += `Kalori: ${Math.round(Number(daily.total_calories))} / ${calorieGoal} Kcal\n`;
    reply += `Protein: ${round1(Number(daily.total_protein))} / ${proteinGoal} g\n`;
    reply += `Karbonhidrat: ${round1(Number(daily.total_carbs))} / ${carbsGoal} g\n`;
    reply += `Yağ: ${round1(Number(daily.total_fat))} / ${fatGoal} g\n`;
    reply += `🎯 ${remainingText("Kalan", calorieGoal, Number(daily.total_calories), "Kcal")}\n`;

    const byType: string[] = [];
    for (const t of MEAL_TYPE_ORDER) {
      const group = mealRows.filter((m) => m.meal_type === t);
      if (group.length === 0) continue;
      const s = sumMeals(group);
      byType.push(`${MEAL_TYPE_ICONS[t]} ${MEAL_TYPE_LABELS[t]}: ${Math.round(s.cal)} Kcal (P ${round1(s.p)} g · K ${round1(s.c)} g · Y ${round1(s.f)} g)`);
    }
    if (byType.length > 0) reply += `\n${byType.join("\n")}\n`;
    reply += `\n`;
  } else {
    reply += `🍽️ Beslenme: Henüz kayıt yok\n\n`;
  }

  if (water) {
    const waterPct = Math.min(100, Math.round((water.total_ml / waterGoal) * 100));
    reply += `💧 Su: ${water.total_ml} / ${waterGoal} ml (${waterPct}%)\n\n`;
  } else {
    reply += `💧 Su: Henüz kayıt yok\n\n`;
  }

  reply += workout ? `🏋️‍♂️ Antrenman: Yapıldı ✅\n\n` : `🏋️‍♂️ Antrenman: Henüz kayıt yok\n\n`;

  if (supps.length > 0) {
    const suppNames = supps.map((s: { supplement_name: string }) => s.supplement_name).join(", ");
    reply += `💊 Takviyeler: ${suppNames}`;
  } else {
    reply += `💊 Takviyeler: Henüz kayıt yok`;
  }

  return reply.trim();
}

// ── Öğün Geçmişi (tüm gün ya da tek öğün) ──────────────────
async function handleMealHistory(
  supabase: ReturnType<typeof createClient>,
  profile: Record<string, unknown>,
  aiResult: AIResponse
): Promise<string> {
  const localDate = getLocalDate();
  const meals = await getTodayMealsWithItems(supabase, profile.id as string, localDate);
  const mealTypeFilter = resolveMealType(aiResult.meal_type);

  // Tek öğün: "kahvaltıda ne yedim", "öğlen ne yedim", "akşam ne yedim"
  if (mealTypeFilter) {
    const group = meals.filter((m) => m.meal_type === mealTypeFilter);
    const icon = MEAL_TYPE_ICONS[mealTypeFilter];
    const label = MEAL_TYPE_LABELS[mealTypeFilter];
    let waterLine = "";
    if (mealTypeFilter === "drink") {
      const { data: w } = await supabase.from("v_daily_water").select("total_ml")
        .eq("user_id", profile.id).eq("local_date", localDate).maybeSingle();
      if (w?.total_ml) waterLine = `\n\n💧 Su: ${w.total_ml} ml (su ayrı takip ediliyor)`;
    }
    if (group.length === 0) {
      const none = mealTypeFilter === "drink" ? "içecek" : label.toLocaleLowerCase("tr-TR");
      return `${icon} Bugün henüz ${none} kaydın yok.${waterLine}`;
    }
    let reply = `${icon} Bugünkü ${label}\n\n`;
    for (const m of group) {
      for (const it of m.meal_items ?? []) {
        reply += formatItemLine(it.food_name_snapshot, it.quantity, it.unit, Number(it.calories), it.protein) + "\n";
      }
    }
    reply += `\n📊 Toplam\n${macroLine(sumMeals(group))}${waterLine}`;
    return reply;
  }

  // Tüm gün: öğün öğün değerler + günün toplamı
  if (meals.length === 0) return "Bugün henüz öğün kaydın yok.";

  let reply = `📋 Bugünkü öğünlerin:\n`;
  reply += formatMealsByType(meals);
  reply += `\n📊 Günün toplamı\n${macroLine(sumMeals(meals))}`;
  return reply.trim();
}

// ── Yardımcı: Türkiye saatine göre tarih ─────────────────
function getLocalDate(): string {
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date()).split(".").reverse().join("-");
}
