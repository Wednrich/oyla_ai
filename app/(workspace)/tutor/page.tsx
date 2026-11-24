import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Tutor } from "@/components/tutor/tutor";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { verifiedUser } from "@/lib/supabase/server";
import { deepSeekConfig } from "@/lib/tutor/deepseek";
import { guidedSelect, isGuidedAction, isGuidedLanguage, type GuidedSession } from "@/lib/tutor/guided";
import { isLearningMode, isUuid, type TutorConversation, type TutorMessage } from "@/lib/tutor/modes";

export const metadata: Metadata = { title: "AI Tutor" };

export default async function TutorPage({ searchParams }: { searchParams: Promise<{ conversation?: string }> }) {
  const auth = await verifiedUser();
  if (!auth) redirect("/login?next=/tutor");
  const { conversation } = await searchParams;
  if (conversation != null && !isUuid(conversation)) notFound();

  const { user, db } = auth;
  const [recent, settings, selected, history, guide, profile] = await Promise.all([
    db.from("conversations").select("id,title,learning_mode,updated_at").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(30),
    db.from("user_settings").select("preferred_learning_mode").eq("user_id", user.id).maybeSingle(),
    conversation ? db.from("conversations").select("id,title,learning_mode,updated_at").eq("user_id", user.id).eq("id", conversation).maybeSingle() : null,
    conversation ? db.from("messages").select("id,request_id,role,content").eq("conversation_id", conversation)
      .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(100) : null,
    conversation ? db.from("oyla_guided_sessions").select(guidedSelect).eq("conversation_id", conversation).maybeSingle()
      : db.from("oyla_guided_sessions").select("conversation_id").limit(0),
    db.from("profiles").select("preferred_language").eq("id", user.id).maybeSingle(),
  ]);
  const loadError = Boolean(recent.error || settings.error || selected?.error || history?.error);
  if (conversation && !selected?.data && !loadError) notFound();
  const active = selected?.data as TutorConversation | undefined;
  const mode = settings.data?.preferred_learning_mode;
  const messages = ((history?.data ?? []) as TutorMessage[]).reverse();
  const initialGuide = conversation && guide.data ? guide.data as GuidedSession : undefined;
  const last = messages.at(-1);
  const pending = initialGuide?.status === "active" && last?.role === "user"
    ? await db.from("oyla_guided_turns").select("action").eq("conversation_id", conversation).eq("request_id", last.request_id).maybeSingle()
    : null;
  const action = pending?.data?.action;
  const language: unknown = profile.data?.preferred_language?.split("-")[0];
  const configured = Boolean(createAdminSupabase() && deepSeekConfig());

  return (
    <Tutor key={conversation ?? "new"} active={active} conversations={(recent.data ?? []) as TutorConversation[]}
      initialMessages={messages} defaultMode={isLearningMode(mode) ? mode : "guided"}
      initialGuide={initialGuide} guidedAvailable={!guide.error} pendingGuidedAction={isGuidedAction(action) ? action : undefined}
      defaultLanguage={isGuidedLanguage(language) ? language : "en"}
      configured={configured} loadError={loadError} />
  );
}
