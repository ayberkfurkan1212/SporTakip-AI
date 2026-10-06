import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("MY_SERVICE_ROLE_KEY")!;
const WHATSAPP_TOKEN = Deno.env.get("WHATSAPP_TOKEN")!;
const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")!;
const REMINDERS_SECRET = Deno.env.get("REMINDERS_SECRET") ?? "";

// Sabit süreli karşılaştırma (timing attack'e karşı)
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function getLocalDate(): string {
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date()).split(".").reverse().join("-");
}

function getLocalHour(): number {
  const hourStr = new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul", hour: "2-digit", hour12: false,
  }).format(new Date());
  return parseInt(hourStr, 10);
}

function isSunday(): boolean {
  const weekday = new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul", weekday: "long",
  }).format(new Date());
  return weekday === "Pazar";
}

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

const BREAKFAST_MESSAGES = [
  "🍽️ Günaydın! Henüz kahvaltını girmedin — unutma, seni bekliyorum 😊",
  "☀️ Kahvaltı yaptın mı? Girmeyi unutma, birlikte takip edelim!",
  "🍽️ Sabah oldu ama kahvaltı kaydın yok. Yediysen yazmayı unutma 😊",
];

const NO_MEALS_MESSAGES = [
  "🍽️ Bugün hiç öğün girmedin. Ne yediysen paylaşmayı unutma!",
  "📋 Gün bitmek üzere ama hiç yemek kaydın yok — takibi kaçırma 😊",
];

const STREAK_MESSAGES = [
  (n: number) => `🔥 ${n} gündür kesintisiz kayıt tutuyorsun! Harikasın, devam et.`,
  (n: number) => `🔥 ${n} günlük seri! Bu tempoyu koru 💪`,
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function computeStreak(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  today: string
): Promise<number> {
  const { data } = await supabase
    .from("meals")
    .select("local_date")
    .eq("user_id", userId)
    .order("local_date", { ascending: false })
    .limit(200);

  if (!data || data.length === 0) return 0;

  const uniqueDates = [...new Set(data.map((d) => d.local_date as string))].sort().reverse();

  let streak = 0;
  const cursor = new Date(today);
  for (const dateStr of uniqueDates) {
    const expected = cursor.toISOString().split("T")[0];
    if (dateStr === expected) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

function computeProgramDay(startDateStr: string, cycleLength: number, today: string): number {
  const start = new Date(startDateStr);
  const now = new Date(today);
  const diffDays = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  const dayInCycle = ((diffDays % cycleLength) + cycleLength) % cycleLength;
  return dayInCycle + 1;
}

async function buildProgramReminder(
  supabase: ReturnType<typeof createClient>,
  profile: Record<string, unknown>,
  today: string
): Promise<string | null> {
  const startDate = profile.program_start_date as string | null;
  const cycleLength = profile.program_cycle_length as number | null;
  if (!startDate || !cycleLength) return null;

  const dayNumber = computeProgramDay(startDate, cycleLength, today);

  const { data: dayProgram } = await supabase
    .from("workout_programs")
    .select("day_label, exercises")
    .eq("user_id", profile.id)
    .eq("day_number", dayNumber)
    .maybeSingle();

  if (!dayProgram) return null;

  const exercises = (dayProgram.exercises as { name: string; sets?: number; reps?: string }[]) || [];

  if (exercises.length === 0) {
    return `📅 Bugün ${dayNumber}. Gün — ${dayProgram.day_label}\n\nBugün dinlenme günün, iyi dinlen! 😌`;
  }

  let msg = `📅 Bugün ${dayNumber}. Gün — ${dayProgram.day_label}\n\n`;
  for (const ex of exercises) {
    msg += `• ${ex.name}`;
    if (ex.sets && ex.reps) msg += ` ${ex.sets}x${ex.reps}`;
    msg += `\n`;
  }
  msg += `\nİyi antrenmanlar! 💪`;
  return msg;
}

async function buildWeeklyReport(
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
      .eq("user_id", profile.id).gte("local_date", weekAgoStr).lte("local_date", today),
    supabase.from("v_daily_water").select("local_date, total_ml")
      .eq("user_id", profile.id).gte("local_date", weekAgoStr).lte("local_date", today),
    supabase.from("weight_logs").select("weight, local_date")
      .eq("user_id", profile.id).gte("local_date", weekAgoStr).lte("local_date", today)
      .order("local_date", { ascending: true }),
    supabase.from("workout_sessions").select("local_date")
      .eq("user_id", profile.id).gte("local_date", weekAgoStr).lte("local_date", today),
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
    reply += `🍽️ Beslenme (${meals.length}/7 gün kayıt):\n• Ort. Kalori: ${avgCalories} Kcal (hedef: ${calorieGoal})\n• Ort. Protein: ${avgProtein} g (hedef: ${proteinGoal})\n\n`;
  } else {
    reply += `🍽️ Beslenme: Bu hafta kayıt yok\n\n`;
  }

  if (waters.length > 0) {
    const avgWater = Math.round(waters.reduce((s, w) => s + Number(w.total_ml), 0) / waters.length);
    reply += `💧 Su (${waters.length}/7 gün kayıt):\n• Ort. Su: ${avgWater} ml (hedef: ${waterGoal})\n\n`;
  } else {
    reply += `💧 Su: Bu hafta kayıt yok\n\n`;
  }

  reply += `🏋️ Antrenman: ${workouts.length}/7 gün\n\n`;

  if (weights.length >= 2) {
    const first = Number(weights[0].weight);
    const last = Number(weights[weights.length - 1].weight);
    const diff = Math.round((last - first) * 10) / 10;
    const arrow = diff > 0 ? "📈" : diff < 0 ? "📉" : "➡️";
    reply += `⚖️ Kilo: ${first} → ${last} kg (${arrow} ${diff > 0 ? "+" : ""}${diff} kg)`;
  }

  return reply.trim();
}

Deno.serve(async (req) => {
  // Yetkilendirme: sadece doğru secret header'ı gönderen (n8n) tetikleyebilir.
  // REMINDERS_SECRET tanımlı değilse fonksiyon kapalı kalır (fail-closed).
  const provided = req.headers.get("x-reminders-secret") ?? "";
  if (!REMINDERS_SECRET || !safeEqual(provided, REMINDERS_SECRET)) {
    console.warn("send-reminders: unauthorized request");
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const localDate = getLocalDate();
  const hour = getLocalHour();
  const sunday = isSunday();

  try {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, phone_e164, water_goal_ml, onboarding_step, supplements, training_program, program_start_date, program_cycle_length, calorie_goal, protein_goal")
      .gte("onboarding_step", 11)
      .eq("plan", "premium")
      .or(`premium_until.is.null,premium_until.gte.${localDate}`);

    if (!profiles || profiles.length === 0) {
      return Response.json({ sent: 0 });
    }

    let sentCount = 0;

    for (const profile of profiles) {
      if (!profile.phone_e164) continue;
      const phone = profile.phone_e164 as string;

      const { data: mealsToday } = await supabase
        .from("meals")
        .select("id, meal_type")
        .eq("user_id", profile.id)
        .eq("local_date", localDate);

      const hasBreakfast = (mealsToday ?? []).some((m) => m.meal_type === "breakfast");
      const hasAnyMeal = (mealsToday ?? []).length > 0;

      // Sabah/öğlen: kahvaltı + program hatırlatması
      if (hour >= 10 && hour < 13) {
        if (!hasBreakfast) {
          await sendWhatsAppMessage(phone, pickRandom(BREAKFAST_MESSAGES));
          sentCount++;
        }

        const programMsg = await buildProgramReminder(supabase, profile, localDate);
        if (programMsg) {
          await sendWhatsAppMessage(phone, programMsg);
          sentCount++;
        }

        continue;
      }

      // Akşam penceresi: su, öğün, takviye, antrenman, kilo, seri, (Pazar) haftalık rapor
      if (hour >= 19 && hour < 23) {
        const sections: string[] = [];

        if (!hasAnyMeal) {
          await sendWhatsAppMessage(phone, pickRandom(NO_MEALS_MESSAGES));
          sentCount++;
        } else {
          const { data: waterData } = await supabase
            .from("v_daily_water").select("total_ml")
            .eq("user_id", profile.id).eq("local_date", localDate).maybeSingle();
          const totalMl = waterData?.total_ml ?? 0;
          const goal = profile.water_goal_ml ?? 2500;
          if (totalMl < goal) {
            sections.push(`💧 Su hedefine henüz ulaşmadın (${totalMl} / ${goal} ml)`);
          }
        }

        const supplements = (profile.supplements as string || "").trim().toLowerCase();
        if (supplements && supplements !== "yok") {
          const { data: suppToday } = await supabase
            .from("supplement_logs").select("id")
            .eq("user_id", profile.id).eq("local_date", localDate).limit(1);
          if (!suppToday || suppToday.length === 0) {
            sections.push("💊 Bugün henüz takviye kaydın yok");
          }
        }

        const trainingProgram = (profile.training_program as string || "").trim().toLowerCase();
        if (trainingProgram && trainingProgram !== "yok") {
          const threeDaysAgo = new Date(localDate);
          threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
          const { data: recentWorkouts } = await supabase
            .from("workout_sessions").select("id")
            .eq("user_id", profile.id)
            .gte("local_date", threeDaysAgo.toISOString().split("T")[0])
            .limit(1);
          if (!recentWorkouts || recentWorkouts.length === 0) {
            sections.push("🏋️‍♂️ Son birkaç gündür antrenman kaydın yok");
          }
        }

        const { data: lastWeight } = await supabase
          .from("weight_logs").select("local_date")
          .eq("user_id", profile.id)
          .order("local_date", { ascending: false }).limit(1).maybeSingle();
        const sevenDaysAgo = new Date(localDate);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const sevenDaysAgoStr = sevenDaysAgo.toISOString().split("T")[0];
        if (!lastWeight || (lastWeight.local_date as string) < sevenDaysAgoStr) {
          sections.push("⚖️ Bir süredir kilo kaydın yok, tartılmayı unutma");
        }

        const streak = await computeStreak(supabase, profile.id as string, localDate);
        let streakMsg: string | null = null;
        if ([3, 7, 14, 21, 30, 60, 90].includes(streak)) {
          streakMsg = pickRandom(STREAK_MESSAGES)(streak);
        }

        // Eksiklik hatırlatmaları varsa tek mesajda birleştir
        if (sections.length > 0) {
          let combined = "📋 Günün hatırlatmaları\n\n";
          combined += sections.map((s) => `• ${s}`).join("\n");
          await sendWhatsAppMessage(phone, combined);
          sentCount++;
        }

        // Seri kutlaması ayrı, çünkü pozitif bir mesaj — eksiklik listesiyle karışmasın
        if (streakMsg) {
          await sendWhatsAppMessage(phone, streakMsg);
          sentCount++;
        }

        // Pazar akşamı haftalık rapor da ayrı gönderilir (zaten kendi başına kapsamlı bir mesaj)
        if (sunday) {
          const report = await buildWeeklyReport(supabase, profile);
          await sendWhatsAppMessage(phone, `📬 Haftalık raporun hazır!\n\n${report}`);
          sentCount++;
        }
      }
    }

    return Response.json({ sent: sentCount, hour, sunday });
  } catch (err) {
    console.error("send-reminders error:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
});
