"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { deleteAccount, updateConsent, updatePreferences, updateProfile, uploadAvatar } from "@/lib/account/actions";
import { learningModes, type LearningMode } from "@/lib/tutor/modes";

interface Profile {
  full_name: string;
  university: string | null;
  major: string | null;
  academic_year: number | null;
  preferred_language: string;
}

function Feedback({ state }: { state: { error?: string; success?: string } }) {
  return state.error ? <p className="auth-feedback" role="alert">{state.error}</p>
    : state.success ? <p className="auth-feedback" role="status">{state.success}</p> : null;
}

export function SettingsForms({ profile, preferredMode, participant, guidedConsent, privileged }: {
  profile: Profile; preferredMode: LearningMode; participant?: string; guidedConsent: boolean; privileged: boolean;
}) {
  const [profileState, profileAction, saving] = useActionState(updateProfile, {});
  const [avatarState, avatarAction, uploading] = useActionState(uploadAvatar, {});
  const [preferencesState, preferencesAction, changingPreferences] = useActionState(updatePreferences, {});
  const [consentState, consentAction, changingConsent] = useActionState(updateConsent, {});
  const [deleteState, deleteAction, deleting] = useActionState(deleteAccount, {});

  return (
    <div className="settings-stack">
      <section className="surface settings-card" id="profile" aria-labelledby="profile-title">
        <h2 id="profile-title">Profile</h2>
        <form className="account-form settings-grid" action={profileAction}>
          <label>Full name<input name="full_name" defaultValue={profile.full_name} maxLength={100} autoComplete="name" required /></label>
          <label>University<input name="university" defaultValue={profile.university ?? ""} maxLength={160} /></label>
          <label>Major<input name="major" defaultValue={profile.major ?? ""} maxLength={160} /></label>
          <label>Academic year<input name="academic_year" type="number" min={1} max={12} defaultValue={profile.academic_year ?? ""} /></label>
          <label>Preferred language code<input name="preferred_language" defaultValue={profile.preferred_language} maxLength={6} placeholder="en" required /></label>
          <div className="settings-span"><Feedback state={profileState} /><Button type="submit" disabled={saving}>Save profile</Button></div>
        </form>
        <form className="account-form settings-avatar" action={avatarAction}>
          <label>Profile picture<input name="avatar" type="file" accept="image/jpeg,image/png,image/webp" required /></label>
          <p className="account-hint">JPEG, PNG, or WebP. Up to 2 MB.</p>
          {!privileged && <p className="auth-feedback" role="status">Configuration required. Set the Supabase server key to upload an avatar.</p>}
          <Feedback state={avatarState} />
          <Button variant="outline" type="submit" disabled={uploading || !privileged}>Upload avatar</Button>
        </form>
      </section>
      <section className="surface settings-card" aria-labelledby="preferences-title">
        <h2 id="preferences-title">Learning preferences</h2>
        <form className="account-form" action={preferencesAction}>
          <label>Default tutor mode<select name="learning_mode" defaultValue={preferredMode}>{learningModes.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}</select></label>
          <Feedback state={preferencesState} />
          <Button type="submit" disabled={changingPreferences}>Save preferences</Button>
        </form>
      </section>
      <section className="surface settings-card" aria-labelledby="consent-title">
        <h2 id="consent-title">Research participation</h2>
        <p>With your consent, OYLA records completed tutor interactions, modes, and dates using a research ID. Guided research also records stage changes, hint levels, attempts, session duration when eligible, and flagged answer-disclosure events. Exports exclude your name, email, and chat text. You can withdraw at any time and remove linked events.</p>
        <p>{participant ? <>Participation enabled. Your research ID is <code>{participant}</code>.</> : "Participation is off."}</p>
        {participant && !guidedConsent && <p>Guided metrics are off for your existing consent unless you enable them below.</p>}
        <form action={consentAction}>
          <Feedback state={consentState} />
          <div className="guide-actions">
            {participant && !guidedConsent && <Button type="submit" name="consent" value="yes" variant="outline" disabled={changingConsent || !privileged}>Include guided metrics</Button>}
            <Button type="submit" name="consent" value={participant ? "no" : "yes"} variant="outline" disabled={changingConsent || !privileged}>{participant ? "Withdraw consent" : "Opt in to research"}</Button>
          </div>
        </form>
      </section>
      <section className="surface settings-card" aria-labelledby="delete-title">
        <h2 id="delete-title">Delete account</h2>
        <p>Permanently remove your OYLA account, saved conversations, private files, and linked research records.</p>
        <form className="account-form" action={deleteAction}>
          <label>Current password<input name="password" type="password" autoComplete="current-password" required /></label>
          <label>Type DELETE to confirm<input name="confirmation" autoComplete="off" maxLength={6} required /></label>
          <Feedback state={deleteState} />
          <Button type="submit" variant="outline" disabled={deleting || !privileged}>Delete account</Button>
        </form>
      </section>
    </div>
  );
}
