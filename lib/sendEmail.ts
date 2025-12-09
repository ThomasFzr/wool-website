import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  // Skip sending emails in development mode
  if (process.env.NODE_ENV === "development") {
    console.log("[sendEmail] DEV MODE - Email not sent:");
    console.log("To:", to);
    console.log("Subject:", subject);
    console.log("HTML preview:", html.substring(0, 200) + "...");
    return { data: { id: "dev-mode-skip" } };
  }

  try {
    const result = await resend.emails.send({
      from: process.env.EMAIL_FROM || "",
      to,
      subject,
      html,
    });


    const id = (result as any)?.data?.id;
    const error = (result as any)?.error;

    if (error) {
      console.error("[sendEmail] RESEND ERROR", error);
    }

    return result;
  } catch (err: any) {
    console.error("[sendEmail] ERROR", {
      to,
      subject,
      err: err?.message || err,
    });
    throw err;
  }
}