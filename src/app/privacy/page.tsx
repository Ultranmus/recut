import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Recut handles your media, your data and your Google Calendar access.",
  alternates: { canonical: "/privacy" },
};

const CONTACT = "https://github.com/Ultranmus/recut/issues";

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="31 October 2026">
      <p>
        Recut turns long podcasts and videos into short clips with captions for each social platform. This policy explains what
        happens to your data when you use it. In short: Recut has no accounts and no database. Your projects stay in your own
        browser, and we only send data to the services needed to do what you ask.
      </p>

      <h2>What Recut stores, and where</h2>
      <p>
        Your projects (transcripts, clips, captions), Brand Memory rules, performance learnings, content calendar and settings are
        saved <strong>only in your browser</strong> (IndexedDB and local storage). They are not uploaded to or kept on our servers. You
        can delete all of it at any time in <strong>Settings → Clear all my data</strong>, or by clearing your browser&apos;s site
        data.
      </p>

      <h2>Media you upload</h2>
      <p>
        Audio is extracted from your file inside your browser. To transcribe it, the audio is sent in short pieces to{" "}
        <a href="https://groq.com/privacy-policy/">Groq</a>, either through our server (when using the app&apos;s shared key) or
        directly from your browser (when you add your own Groq key). Transcripts, and text needed to pick clips and write captions,
        are sent to Groq&apos;s AI models in the same way. Our server passes these requests through and does not store or log their
        contents. Your original video or audio file never leaves your device.
      </p>

      <h2>Voice briefs</h2>
      <p>
        If you use the in-app Record button, the recording is sent to Groq for transcription in the same way as uploads. If you dictate
        with Wispr Flow, that happens in Wispr Flow under its own privacy policy; Recut only receives the text it types.
      </p>

      <h2>Google Calendar</h2>
      <p>
        If you choose <strong>Connect Google Calendar</strong>, Recut asks for permission to manage events in your calendar
        (<code>calendar.events</code>). It uses that permission only to create, update and delete the events for posts you schedule
        in Recut, so your Google Calendar matches Recut&apos;s calendar. Recut does not read, copy or change any other events.
      </p>
      <p>
        Sign-in uses Google Identity Services in your browser. The access token is kept in your browser, expires after about an hour,
        and is never sent to our server. You can disconnect in Recut at any time, and revoke access at{" "}
        <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a>.
      </p>
      <p>
        Recut&apos;s use of information received from Google APIs adheres to the{" "}
        <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>, including
        the Limited Use requirements. We do not sell this data, use it for advertising, or use it to train AI models.
      </p>

      <h2>Hosting, logs and cookies</h2>
      <p>
        Recut is hosted on Vercel, which keeps standard request logs (such as IP address and time) for security and operations. We use
        your IP address briefly to apply a fair-use limit on the shared AI key. Recut uses no advertising or tracking cookies and no
        analytics.
      </p>

      <h2>Sharing</h2>
      <p>
        We don&apos;t sell or share your data. It goes only to the processors named above (Groq for AI, Google if you connect your
        calendar, Vercel for hosting), and only to provide the features you use. When you post to a social network from Recut, you do
        that on the network&apos;s own site under its terms.
      </p>

      <h2>Children</h2>
      <p>Recut is not directed at children under 13, and we don&apos;t knowingly collect their data.</p>

      <h2>Changes and contact</h2>
      <p>
        If this policy changes, we&apos;ll update the date above. Questions or requests: open an issue at{" "}
        <a href={CONTACT}>github.com/Ultranmus/recut/issues</a>.
      </p>
    </LegalPage>
  );
}
