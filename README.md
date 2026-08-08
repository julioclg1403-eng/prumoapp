# Prumo

App de gestão de obra. React 19 + Vite 6 + Supabase + Vercel.

**No ar:** https://prumoapp-kohl.vercel.app

Estado atual: **publicado, com banco de dados real e as duas obras
cadastradas** (YACHT by Fama e SEDE FAMA).

## Como publicar uma alteração

Não existe passo manual. A Vercel está ligada ao repositório:

```bash
git add .
git commit -m "o que mudou"
git push
```

O site se atualiza sozinho em cerca de um minuto, no mesmo endereço.

> **Atenção às variáveis de ambiente.** `VITE_SUPABASE_URL` e
> `VITE_SUPABASE_ANON_KEY` são lidas na hora de MONTAR o app, não quando
> alguém abre a página. Mudar uma delas na Vercel não tem efeito até a
> próxima publicação.

---

## Como rodar no seu computador

1. Abra esta pasta no Cursor (ou VS Code): **Arquivo → Abrir Pasta**.
2. Abra o terminal embutido: menu **Terminal → Novo Terminal**.
3. Só na primeira vez, instale as peças:

```bash
npm install
```

4. Ligue o app:

```bash
npm run dev
```

5. Vai aparecer um endereço tipo `http://localhost:5173`. Segure **Ctrl** e
   clique nele (ou copie no navegador).

Para parar, aperte **Ctrl+C** no terminal. Enquanto estiver ligado, a tela
atualiza sozinha quando o código muda.

Na tela de login, escolha um dos três perfis de demonstração para ver o app
pelos olhos de cada tipo de usuário. Não precisa de senha ainda.

---

## O que dá para fazer hoje

- **Campo** — lançar o diário do dia nas 4 etapas (presenças, frentes de
  serviço, ocorrências, revisão), cadastrar colaborador na hora, abrir e
  resolver pendências.
- **Gestão** — painel da obra, histórico de diários, efetivo consolidado,
  fila de revisão dos cadastros feitos no campo, cadastros auxiliares.
- **Admin** — tudo da gestão, mais a tela de usuários e papéis.

Tudo que você criar ou alterar vive **só na memória do navegador**. Ao
recarregar a página, volta ao estado inicial. Isso é esperado: o banco entra na
Etapa 7.

---

## Mapa dos arquivos

```
src/
  App.jsx                 quem entrou e qual casca mostrar
  index.css               design system (grafite + laranja)
  lib/
    config.js             USAR_MOCK — o interruptor entre demo e banco
    dominio.js            REGRAS DE NEGÓCIO — fonte única de cálculo
    mockData.js           dados de demonstração (todos fictícios)
    DadosContext.jsx      estado global; toda gravação passa por aqui
    supabase.js           conexão com o banco (usada a partir da Etapa 7)
  pages/
    Login.jsx
    AppCampo.jsx          casca do campo — barra inferior, mobile-first
    AppGestao.jsx         casca da gestão/admin — menu lateral no desktop
  components/index.jsx    peças reutilizáveis
  screens/                uma tela por arquivo
```

Duas regras que sustentam o resto:

1. **Todo cálculo derivado mora em `lib/dominio.js`.** Atraso, situação,
   total, média. A tela, o contador do menu e o painel chamam a mesma função —
   é o que impede o menu dizer 3 e a tela mostrar 5.
2. **Toda gravação passa por `lib/DadosContext.jsx`.** Nenhuma tela grava
   sozinha. Na Etapa 7, só o corpo dessas funções vira chamada ao Supabase; as
   telas não mudam.

---

## Próximas etapas

| # | Etapa | Situação |
|---|---|---|
| 1 | Lapidar a ideia (`BRIEFING.md`) | ✅ |
| 2 | Design das telas | ✅ feito direto em código |
| 3 | Front-end | ✅ |
| 4 | Testar com dados mock | ✅ |
| 5 | Debug e plano de reparo | ✅ |
| 6 | Subir para o GitHub | ✅ |
| 7 | Banco no Supabase | ✅ |
| 8 | Obras reais cadastradas | ✅ |
| 9 | Deploy na Vercel | ✅ |
| 10 | Debug final no ar | ✅ |

## O que falta para o uso real

- [ ] Cadastrar **empresas** e **serviços** das duas obras (pelo app)
- [ ] Julio criar a conta própria e ser promovido a admin
- [ ] Apagar as três contas de demonstração (`*@example.com`)
- [ ] Ligar a proteção contra senha vazada no painel do Supabase
- [ ] Colaboradores: **não digitar** — o mestre cadastra no diário e a
      gestão confere na fila de revisão
