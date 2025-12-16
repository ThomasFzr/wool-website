export function emailTemplate(content: string): string {
  const logoUrl = `${process.env.NEXT_PUBLIC_APP_URL}/images/logo.png`;
  
  // Note: Les emails HTML ne supportent pas @font-face, on utilise une police similaire avec fallback
  // Clash Display est une police display moderne, on utilise une alternative proche
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <!-- Clash Display via Google Fonts pour meilleure compatibilité email -->
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    </head>
    <body style="margin:0;padding:0;font-family:'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color:#0f172a; background:#f8fafc; padding:24px;">
      <div style="max-width:600px;margin:0 auto;background:white;border-radius:16px;padding:24px;border:1px solid #e5e7eb;">
        <!-- Logo -->
        <div style="text-align:center;margin-bottom:24px;">
          <img src="${logoUrl}" alt="MailleMum" style="height:80px;width:auto;" />
        </div>
        
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
