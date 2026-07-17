// Template base della firma Abruzzo Digitale (2 colonne: dettagli+icone a sinistra,
// foto+logo a destra). Caricato in Unlayer con loadHtml quando un utente crea una
// nuova firma; poi modificabile a blocchi.
//
// I dati AZIENDALI (telefono fisso, sito, indirizzo, social, logo) sono reali e
// uguali per tutti. I dati PERSONALI sono PLACEHOLDER da sostituire per ogni utente:
//   • "Nome Cognome"  → nome dell'utente
//   • "Ruolo" / "Reparto" → ruolo/reparto
//   • "+39 000 000 0000" → cellulare
//   • "nome@abruzzodigitale.com" → email
//   • la foto (placeholder) → foto dell'utente

export const SIGNATURE_BASE_HTML = `<table cellpadding="0" cellspacing="0" style="background-color: #ffffff; font-family: Tahoma; font-size: medium; vertical-align: -webkit-baseline-middle;">
    <tbody>
        <tr>
            <td style="vertical-align: top;">
                <h2 style="margin: 0; font-size: 18px; color: rgb(0, 0, 0); font-weight: 600;">Nome Cognome</h2>
                <p style="margin: 0; color: rgb(0, 0, 0); font-size: 14px; line-height: 22px;">Ruolo<br>Reparto | Abruzzo Digitale</p>
                <p style="margin: 0; color: rgb(0, 0, 0); font-size: 12px; line-height: 20px;">
            <span style="display: inline-block; white-space: nowrap;">
                <img src="https://cdn2.hubspot.net/hubfs/53/tools/email-signature-generator/icons/phone-icon-2x.png" alt="phone" style="vertical-align:middle; background-color: #eb2f5b; width: 13px; margin-right: 6px;">
                <a href="tel:+390859564770" style="text-decoration: none; color: rgb(0, 0, 0);">+39 085 956 4770</a> | <a href="tel:+390000000000" style="text-decoration: none; color: rgb(0, 0, 0);">+39 000 000 0000</a>
            </span><br>
            <span style="display: inline-block; white-space: nowrap;">
                <img src="https://cdn2.hubspot.net/hubfs/53/tools/email-signature-generator/icons/email-icon-2x.png" alt="email" style="vertical-align:middle; background-color: #eb2f5b; width: 13px; margin-right: 6px;">
                <a href="mailto:nome@abruzzodigitale.com" style="text-decoration: none; color: rgb(0, 0, 0);">nome@abruzzodigitale.com</a>
            </span><br>
            <span style="display: inline-block; white-space: nowrap;">
                <img src="https://cdn2.hubspot.net/hubfs/53/tools/email-signature-generator/icons/link-icon-2x.png" alt="link" style="vertical-align:middle; background-color: #eb2f5b; width: 13px; margin-right: 6px;">
                <a href="https://www.abruzzodigitale.com" style="text-decoration: none; color: rgb(0, 0, 0);">www.abruzzodigitale.com</a>
            </span><br>
            <span style="display: inline-block; white-space: nowrap;">
                <img src="https://cdn2.hubspot.net/hubfs/53/tools/email-signature-generator/icons/address-icon-2x.png" alt="address" style="vertical-align:middle; background-color: #eb2f5b; width: 13px; margin-right: 6px;">
                <a href="https://www.google.com/maps/search/Corso%20Giuseppe%20Garibaldi%2062%2C%20Giulianova" style="text-decoration: none; color: rgb(0, 0, 0);">Corso Giuseppe Garibaldi 62, Giulianova</a>
            </span></p>

        <table cellpadding="0" cellspacing="0" style="height: 100%;"><tbody><tr><td style="vertical-align: bottom; padding-top: 20px;">
            <table cellpadding="0" cellspacing="0">
                <tbody><tr>
            <td><a href="https://www.facebook.com/abruzzodigitale"><img src="https://cdn2.hubspot.net/hubfs/53/tools/email-signature-generator/icons/facebook-icon-2x.png" style="background-color: #eb2f5b; width: 24px; display:block;"></a></td>
            <td width="5"></td>
            <td><a href="https://www.linkedin.com/company/abruzzo-digitale"><img src="https://cdn2.hubspot.net/hubfs/53/tools/email-signature-generator/icons/linkedin-icon-2x.png" style="background-color: #eb2f5b; width: 24px; display:block;"></a></td>
            <td width="5"></td>
            <td><a href="https://www.instagram.com/abruzzodigitale/"><img src="https://cdn2.hubspot.net/hubfs/53/tools/email-signature-generator/icons/instagram-icon-2x.png" style="background-color: #eb2f5b; width: 24px; display:block;"></a></td>
            <td width="5"></td>
            <td><a href="https://www.tiktok.com/@abruzzodigitale"><img src="https://abruzzodigitale.it/wp-content/uploads/2025/01/tiktok.png" style="background-color: #eb2f5b; width: 24px; display:block; border-radius: 50%;"></a></td>
                </tr>
            </tbody></table>
        </td></tr></tbody></table>

            </td>

        <td width="20"></td>
        <td style="vertical-align: middle; text-align: right;">
            <table cellpadding="0" cellspacing="0" style="text-align: center;">
                <tbody><tr>
                    <td>
                        <img src="https://via.placeholder.com/110x110.png?text=Foto" style="width:110px; display:block; border-radius:8px;">
                    </td>
                </tr>
                <tr><td style="height:10px; line-height:10px;">&nbsp;</td></tr>
                <tr>
                    <td valign="middle" align="right">
                        <img src="https://storage.googleapis.com/abruzzodigitale-siti/Logo%20orizzontale%20nero%20sfondo%20trasparente%20con%20R.png" width="100" style="display:block;">
                    </td>
                </tr>
            </tbody></table>
        </td>

        </tr>
    </tbody>
</table>`;
