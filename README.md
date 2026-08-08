# Agenda do Consultório

Aplicativo de reserva de salas para consultórios (psicólogos + administrador), sem servidor próprio: roda como HTML/CSS/JS estático no navegador e usa o [Supabase](https://supabase.com) (banco Postgres + autenticação) como backend.

## Arquivos

- `index.html` — estrutura da página.
- `style.css` — estilos e cores.
- `app.js` — toda a lógica do app (login, agenda, bloqueios, relatórios).

Não há build, framework ou instalação: basta abrir `index.html` num navegador, ou publicar os três arquivos em qualquer hospedagem de site estático (GitHub Pages, Netlify, etc.).

## Personalização

No topo de `app.js`, o objeto `MARCA` define o nome do consultório, o nome do app e um logo opcional:

```js
const MARCA = {
  nomeConsultorio: 'Consultório',
  nomeApp: 'Agenda',
  logoUrl: ''
};
```

As cores da marca (botões, destaques, cor de cada sala) ficam nas variáveis `:root` no topo de `style.css`.

## Backend (Supabase)

O app se conecta a um projeto Supabase fixo, configurado em `app.js` (`SUPABASE_URL` e `SUPABASE_ANON_KEY`). A `anon key` é uma chave pública — é normal e esperado que ela apareça no código de um app client-side como este; ela não dá acesso irrestrito ao banco por si só. Quem realmente decide o que cada usuário pode ler ou escrever é a configuração de **Row Level Security (RLS)** nas tabelas do Supabase, que não faz parte deste repositório.

### Checklist de segurança a verificar no painel do Supabase

Como o código sozinho não consegue garantir isso, confira estes pontos no painel do Supabase (Authentication + Database → Policies) antes de colocar o app em produção:

1. **RLS habilitado** nas tabelas `perfis`, `reservas`, `bloqueios`, `bloqueios_periodo` e `configuracoes`. Sem isso, qualquer política de linha é ignorada.
2. **Coluna `papel` protegida**: a tela de Configurações permite que um administrador promova/rebaixe qualquer usuário chamando `update` em `perfis.papel` — o código do app não é o que impede um psicólogo comum de fazer essa mesma chamada diretamente pela API. É preciso uma policy que só permita alterar `papel` quando quem está autenticado já é `admin`.
3. **Cadastro não confia no cliente**: no cadastro (`signUp`), o app sugere `papel: 'psicologo'` como metadata, mas isso é só um valor enviado pelo navegador — nada impede alguém de chamar a API de cadastro diretamente com outro valor. O trigger/função que cria a linha em `perfis` a partir do novo usuário deve **sempre** gravar `psicologo`, ignorando qualquer `papel` vindo do metadata.
4. **Reservas e bloqueios com dono**: psicólogos devem conseguir criar/cancelar apenas as próprias reservas (`psicologo_id` = usuário autenticado); criar/gerenciar bloqueios deve ser restrito a `admin`.
5. **Configurações só para admin**: a tabela `configuracoes` (valor da hora) só deve aceitar escrita de usuários `admin`.

Se você não administra o projeto Supabase diretamente, repasse esta lista para quem administra.

## Segurança no código

- Todo texto vindo de usuários (nome no cadastro, motivo de bloqueios) passa pela função `esc()` em `app.js` antes de ser inserido na tela, evitando que alguém injete HTML/JavaScript malicioso em campos de texto livre (XSS).
- O `index.html` inclui uma política de `Content-Security-Policy` restringindo de onde scripts e estilos podem ser carregados, como camada extra de proteção.
- Os campos de texto livre (nome, motivo) têm limite de tamanho (`maxlength`).
