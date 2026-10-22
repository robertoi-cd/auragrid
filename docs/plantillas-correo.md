# Plantillas de correo (Supabase)

La invitación es bilingüe (español e inglés); la recuperación de contraseña, en español.

Se configuran en Supabase → Authentication → Emails → Templates. Supabase sustituye las variables entre llaves dobles (`{{ .ConfirmationURL }}`, `{{ .Email }}`) al enviar. El enlace lleva a la **Site URL** (Authentication → URL Configuration); la app detecta si es una invitación o una recuperación y pide definir la contraseña.

Antes de invitar a personas externas, configura un SMTP propio (Authentication → Emails → SMTP Settings): el correo integrado de Supabase permite muy pocos envíos por hora.

## Invite user (invitación, bilingüe: español arriba, inglés abajo)

**Dónde pegarla:**
1. En supabase.com, abre el proyecto **rtb-solar-mexico-core**.
2. En el menú de la izquierda: **Authentication** → **Emails**.
3. Pestaña **Templates** → plantilla **Invite user**.
4. En **Subject** pega el asunto de abajo (sin los asteriscos).
5. En **Body** (vista *Source*, con el código HTML) borra todo y pega el bloque HTML completo de abajo.
6. **Save changes.**

**Asunto (Subject):** Te invitaron a AuraGrid · You're invited to AuraGrid

```html
<h2>Te invitaron a AuraGrid</h2>
<p>Hola:</p>
<p>Te dieron acceso a AuraGrid, la plataforma para desarrollar parques solares hasta el RTB. Tu cuenta es <strong>{{ .Email }}</strong>.</p>
<p><a href="{{ .ConfirmationURL }}">Aceptar la invitación y definir mi contraseña</a></p>
<p>El enlace es personal y vence. Si ya no funciona, pide a quien te invitó que te envíe uno nuevo.</p>
<p>Versión de prueba: usa datos ficticios y no captures información confidencial de proyectos reales.</p>
<p>Si no esperabas este correo, ignóralo: sin aceptar la invitación no se crea ningún acceso.</p>

<hr>

<h2>You're invited to AuraGrid</h2>
<p>Hello,</p>
<p>You've been given access to AuraGrid, the platform for developing solar parks through RTB (ready to build). Your account is <strong>{{ .Email }}</strong>.</p>
<p><a href="{{ .ConfirmationURL }}">Accept the invitation and set my password</a></p>
<p>This link is personal and expires. If it no longer works, ask the person who invited you to send a new one.</p>
<p>Test version: use fictitious data and do not enter confidential information from real projects.</p>
<p>If you weren't expecting this email, you can ignore it: no access is created unless you accept the invitation.</p>
<p><em>The app is in Spanish.</em></p>
```

## Reset password (recuperar la contraseña)

**Asunto:** Define una nueva contraseña de AuraGrid

```html
<h2>Define una nueva contraseña</h2>
<p>Hola:</p>
<p>Recibimos una solicitud para cambiar la contraseña de <strong>{{ .Email }}</strong> en AuraGrid.</p>
<p><a href="{{ .ConfirmationURL }}">Definir una nueva contraseña</a></p>
<p>El enlace vence y solo se puede usar una vez; si ya no funciona, vuelve a pedirlo desde el login.</p>
<p>Si no lo pediste, ignora este correo: tu contraseña no cambia.</p>
```

## Comprobar

1. Authentication → Users → Invite user, con otro correo tuyo.
2. Abre el correo: el asunto y el texto deben estar en español y el enlace debe llevar a la app publicada.
3. Al abrir el enlace, la app pide definir la contraseña.
4. En el login, "¿Olvidaste tu contraseña?" debe enviar el segundo correo.
5. Un enlace ya usado debe mostrar en la app que venció.

La vigencia de los enlaces se configura en Supabase (Authentication → Providers → Email → Email OTP Expiration). Las plantillas no mencionan un plazo para no contradecir esa configuración.
