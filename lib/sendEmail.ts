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