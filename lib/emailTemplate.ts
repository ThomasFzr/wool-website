export function emailTemplate(content: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  // Pas de logo si l'URL de base n'est pas configurée (évite un src="undefined/...")
  const logoBlock = appUrl
    ? `
        <!-- Logo -->
        <div style="text-align:center;margin-bottom:24px;">
          <img src="${appUrl}/images/logo.png" alt="MailleMum" style="height:80px;width:auto;" />
        </div>
        `
    : "";

  // Note: la plupart des clients mail ignorent les polices externes — la stack système suffit
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin:0;padding:0;font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color:#0f172a; background:#f8fafc; padding:24px;">
      <div style="max-width:600px;margin:0 auto;background:white;border-radius:16px;padding:24px;border:1px solid #e5e7eb;">
        ${logoBlock}
        <!-- Contenu -->
        ${content}

        <!-- Footer -->
        <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;">
          <p style="font-size:11px;color:#9ca3af;text-align:center;margin:0;">
            Cet email est généré automatiquement par MailleMum.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
}
