/* ============================================================
   PÁGINA DE APRESENTAÇÃO DO PRUMO — para quem ainda não entrou.
   Só promete o que o app faz hoje. As telas são maquetes em HTML
   (sempre nítidas) e o relatório é o de verdade, com dados fictícios.
   ============================================================ */

import { useMemo, useState } from 'react'
import { APP_NOME } from '../lib/config'
import { htmlRelatorioExemplo } from '../lib/exemploRelatorio'
import './landing.css'

const Certo = ({ tamanho = 16 }) => (
  <svg className="i" width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
)
const Seta = ({ tamanho = 18 }) => (
  <svg className="i" width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
)
const Marca = () => <span className="lp-marca">{APP_NOME}<span>.</span></span>

const PASSOS = [
  ['Abra a sua obra', 'Em um minuto: nome da empresa, da obra e pronto. Se quiser, comece com dados de exemplo para conhecer cada tela.'],
  ['O mestre lança o dia no celular', 'Quem estava na obra, o que foi feito, o que atrapalhou e as fotos. Tela simples, botões grandes, feita para o canteiro.'],
  ['Você acompanha no painel', 'Efetivo, pendências atrasadas, planejamento da semana e o que pede atenção, no computador ou no celular.'],
  ['Feche a semana e mande o relatório', 'Diário, efetivo e pendências em um PDF no seu layout, pronto para enviar ao cliente.'],
]

const RECURSOS = [
  ['D', 'Diário e efetivo', ['Presença por equipe e empresa, todo dia', 'Atividades planejadas, em andamento e concluídas', 'Ocorrências com tipo e descrição, fotos do dia', 'Consolidado do efetivo e revisão de cadastros']],
  ['P', 'Planejamento e pendências', ['Planejamento semanal, mensal e global ligados entre si', 'Fechamento da semana e avanço físico por etapa', 'Pendências com prazo, prioridade e responsável', 'Lembretes e avisos do que está atrasado']],
  ['S', 'Suprimentos e contratos', ['Pedidos de compra importados, com dashboard de prazo', 'Contratos com cruzamento de itens entre eles', 'Almoxarifado: estoque, máquinas e ferramentas', 'Cadastros de empresas, equipe, locais e serviços']],
  ['M', 'Produtividade e segurança', ['Marcação da execução direto na planta', 'Medição por contrato e rendimento por serviço', 'Ocorrências, quase-acidentes e advertências', 'Treinamentos e entrega de EPI por colaborador']],
]

const PERGUNTAS = [
  ['A equipe de campo usa o mesmo aplicativo?', 'Usa a mesma conta da empresa, mas com uma tela própria: mais simples, com botões grandes e só o que o canteiro precisa. O engenheiro e o escritório veem a versão completa.'],
  ['Preciso instalar alguma coisa?', 'Não precisa de loja de aplicativos. O Prumo abre no navegador do celular e do computador, e pode ser colocado na tela inicial como um aplicativo.'],
  ['Meus dados ficam separados dos de outras empresas?', 'Sim. Cada empresa tem o seu espaço e o banco de dados só entrega a ela o que é dela. Uma empresa nunca vê a obra, a equipe ou os números da outra.'],
  ['Posso conhecer antes de lançar minha obra de verdade?', 'Pode. Ao criar a conta, deixe marcada a opção de dados de exemplo: você ganha uma semana de diários, equipe e pendências fictícios para explorar, e apaga quando quiser.'],
  ['Quanto custa?', 'Os planos ainda estão sendo definidos. Por enquanto você cria a conta e conhece o app, e nada é cobrado automaticamente.'],
  ['Quem faz o Prumo?', 'Julio Guimarães, engenheiro civil em Palmas, Tocantins. O Prumo nasceu da rotina de obra, e você fala direto com quem faz.'],
]

export default function Landing({ aoEntrar, aoCriar }) {
  const [aberta, setAberta] = useState(0)
  const relatorio = useMemo(() => htmlRelatorioExemplo(), [])
  const rolar = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div className="lp">
      <header className="lp-topo">
        <div className="lp-wrap lp-topo-in">
          <Marca />
          <nav className="lp-links" aria-label="Seções">
            <button onClick={() => rolar('como')}>Como funciona</button>
            <button onClick={() => rolar('recursos')}>O que tem</button>
            <button onClick={() => rolar('relatorio')}>Relatório</button>
            <button onClick={() => rolar('perguntas')}>Perguntas</button>
          </nav>
          <div className="lp-topo-acoes">
            <button className="lp-entrar" onClick={aoEntrar}>Entrar</button>
            <button className="lp-cta p" onClick={aoCriar}>Criar minha obra</button>
          </div>
        </div>
      </header>

      <section className="lp-hero">
        <div className="lp-wrap lp-hero-in">
          <div>
            <span className="lp-selo">Gestão de obra, do canteiro ao escritório</span>
            <h1>Diário, efetivo e planejamento da obra num só lugar.</h1>
            <p>O mestre lança o dia no celular. Você acompanha tudo no painel e fecha a semana com um relatório em PDF, sem planilha solta e sem caderno perdido.</p>
            <div className="lp-botoes">
              <button className="lp-cta p grande" onClick={aoCriar}>Criar minha obra <Seta /></button>
              <button className="lp-cta s grande" onClick={() => rolar('como')}>Ver como funciona</button>
            </div>
            <ul className="lp-garantias">
              <li><Certo /> Abra a sua obra em um minuto, sem liberação</li>
              <li><Certo /> Dados de exemplo para conhecer o app</li>
              <li><Certo /> Feito por engenheiro, em Palmas-TO</li>
            </ul>
          </div>

          <div className="lp-hero-vitrine" aria-hidden="true">
            <div className="lp-janela">
              <div className="lp-barra"><i /><i /><i /></div>
              <div className="lp-app">
                <div className="lp-menu">
                  <b>{APP_NOME}<span>.</span></b>
                  <span className="it on">Início</span>
                  <span className="it">Diários</span>
                  <span className="it">Efetivo</span>
                  <span className="it">Pendências</span>
                  <span className="it">Planejamento</span>
                  <span className="it">Relatório</span>
                  <span className="it">Suprimentos</span>
                  <span className="it">Contratos</span>
                </div>
                <div className="lp-painel">
                  <h4>Visão da obra</h4>
                  <small>Residencial Aurora · últimos 7 dias</small>
                  <div className="lp-kpis">
                    <div><small>Efetivo hoje</small><b>12</b></div>
                    <div><small>Média 7 dias</small><b>11,2</b></div>
                    <div><small>Pend. atrasadas</small><b className="r">2</b></div>
                    <div><small>Aguard. revisão</small><b>0</b></div>
                  </div>
                  <div className="lp-cards2">
                    <div>
                      <small className="t">Efetivo por dia</small>
                      <div className="lp-barras">
                        <i data-v="11" style={{ height: '78%' }} /><i data-v="12" style={{ height: '88%' }} /><i data-v="11" style={{ height: '78%' }} />
                        <i data-v="11" style={{ height: '78%' }} /><i data-v="9" style={{ height: '62%' }} /><i data-v="12" style={{ height: '88%' }} />
                      </div>
                    </div>
                    <div>
                      <small className="t">Pendências vencidas</small>
                      <div className="lp-pend">
                        <span>Revisar impermeabilização do reservatório <em>3d</em></span>
                        <span>Repor argamassa no 4º pavimento <em>1d</em></span>
                        <span>Guarda-corpo provisório no 3º pav. <em>hoje</em></span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="lp-celular">
              <div className="lp-cel-tela">
                <div className="lp-cel-topo">Residencial Aurora<small>Diário de hoje</small></div>
                <div className="lp-cel-corpo">
                  <div className="c"><b>Alvenaria de vedação</b>Torre 1 — 3º pav.<br /><span className="lp-chip and">EM ANDAMENTO</span></div>
                  <div className="c"><b>Concretagem de laje</b>Torre 1 — 2º pav.<br /><span className="lp-chip ok">CONCLUÍDA</span></div>
                  <div className="c"><b>Presentes hoje</b>12 pessoas · 4 empresas</div>
                </div>
                <div className="lp-cel-nav"><span className="on">Início</span><span>Diários</span><span>Efetivo</span><span>Pendências</span></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="lp-faixa">
        <div className="lp-wrap lp-faixa-in">
          <div><b>Diário de obra</b><span>presença, atividades, ocorrências e fotos</span></div>
          <div><b>Efetivo do dia</b><span>por equipe e por empresa</span></div>
          <div><b>Planejamento</b><span>semanal, mensal e global ligados</span></div>
          <div><b>Relatório em PDF</b><span>pronto para mandar ao cliente</span></div>
        </div>
      </section>

      <section className="lp-secao" id="como">
        <div className="lp-wrap">
          <h2>Do lançamento do mestre ao relatório do cliente</h2>
          <p className="lp-sub">Quatro passos, sem mudar o jeito que a obra já funciona.</p>
          <ol className="lp-passos">
            {PASSOS.map(([t, d], i) => (
              <li key={t}><span className="lp-num">{i + 1}</span><b>{t}</b><p>{d}</p></li>
            ))}
          </ol>
        </div>
      </section>

      <section className="lp-secao escura" id="recursos">
        <div className="lp-wrap">
          <h2>O que já está pronto</h2>
          <p className="lp-sub">Sem promessa de futuro: é o que você usa desde o primeiro dia.</p>
          <div className="lp-recursos">
            {RECURSOS.map(([letra, titulo, itens]) => (
              <article key={titulo}>
                <span className="lp-icone" aria-hidden="true">{letra}</span>
                <h3>{titulo}</h3>
                <ul>{itens.map((i) => <li key={i}><Certo tamanho={15} />{i}</li>)}</ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-secao" id="relatorio">
        <div className="lp-wrap lp-duas">
          <div>
            <h2>O relatório da semana, pronto para o cliente</h2>
            <p className="lp-sub" style={{ textAlign: 'left' }}>Tudo que a equipe lançou no diário vira um relatório limpo, com a sua marca de engenharia e espaço para assinatura.</p>
            <ul className="lp-lista">
              <li><Certo /> Dias com diário, efetivo médio e atividades concluídas</li>
              <li><Certo /> Gráfico do efetivo e diário dia a dia</li>
              <li><Certo /> Pendências em aberto com prazo e situação</li>
              <li><Certo /> Salve em PDF e envie, em um clique</li>
            </ul>
            <button className="lp-cta p" onClick={aoCriar}>Quero ver com a minha obra</button>
          </div>
          <div className="lp-relatorio" aria-hidden="true">
            <div className="lp-relatorio-mold">
              <iframe title="Exemplo de relatório semanal" srcDoc={relatorio} tabIndex={-1} />
            </div>
          </div>
        </div>
      </section>

      <section className="lp-secao claro" id="ana">
        <div className="lp-wrap lp-ana">
          <div>
            <h2>A Ana, assistente da obra, dentro do app</h2>
            <p className="lp-sub">Pergunte em linguagem de obra e receba a resposta com o dado do seu Prumo, sem caçar nas telas.</p>
            <ul className="lp-lista">
              <li><Certo /> Consulta efetivo, pendências, diários e prazos</li>
              <li><Certo /> Abre a tela certa e cria lembretes por você</li>
              <li><Certo /> Entende perguntas escritas em linguagem de obra</li>
            </ul>
          </div>
          <div className="lp-chat" aria-hidden="true">
            <div className="eu">Quantos estão na obra hoje?</div>
            <div className="ana">12 pessoas presentes, de 4 empresas.</div>
            <div className="eu">Tem pendência atrasada?</div>
            <div className="ana">Duas: impermeabilização do reservatório (3 dias) e argamassa do 4º pavimento (1 dia).</div>
            <small>Exemplo com dados fictícios</small>
          </div>
        </div>
      </section>

      <section className="lp-secao" id="perguntas">
        <div className="lp-wrap estreito">
          <h2>Perguntas que todo engenheiro faz</h2>
          <div className="lp-faq">
            {PERGUNTAS.map(([p, r], i) => (
              <div key={p} className={'lp-faq-item' + (aberta === i ? ' aberta' : '')}>
                <button onClick={() => setAberta(aberta === i ? -1 : i)} aria-expanded={aberta === i}>{p}<span aria-hidden="true">{aberta === i ? '−' : '+'}</span></button>
                {aberta === i && <p>{r}</p>}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-final">
        <div className="lp-wrap">
          <h2>Abra a sua obra no Prumo em um minuto.</h2>
          <p>Crie a conta, cadastre a primeira obra e veja o diário, o efetivo e o relatório funcionando com dados de exemplo.</p>
          <div className="lp-botoes centro">
            <button className="lp-cta p grande" onClick={aoCriar}>Criar minha obra <Seta /></button>
            <button className="lp-cta s grande" onClick={aoEntrar}>Já tenho conta</button>
          </div>
        </div>
      </section>

      <footer className="lp-rodape">
        <div className="lp-wrap lp-rodape-in">
          <Marca />
          <span>Feito por Julio Guimarães, engenheiro civil · Palmas, TO</span>
          <span className="lp-rodape-links">
            <button onClick={aoEntrar}>Entrar</button>
          </span>
        </div>
      </footer>
    </div>
  )
}
