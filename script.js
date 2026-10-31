"use strict";

/* =====================================================================
   Alquerque - 1.ª entrega
   Estrutura:
     Tabuleiro : dados e regras (sem DOM)
     IA        : escolha das jogadas do computador (sem DOM)
     Jogo      : interface (DOM), turnos, sopro, mensagens, classificações
   ===================================================================== */

const N = 5;
const VAZIO = 0, AZUL = 1, VERMELHA = 2;
const NOME = { [AZUL]: "Azuis", [VERMELHA]: "Vermelhas" };
const NIVEIS = { 1: "Fácil", 2: "Médio", 3: "Difícil" };
const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];

const oposta = (cor) => (cor === AZUL ? VERMELHA : AZUL);
const frente = (cor) => (cor === AZUL ? 1 : -1);        // sentido do avanço, em linhas
const chave = (r, c) => r * N + c;
const nome = (p) => "abcde"[p[1]] + (N - p[0]);          // [0,0] -> "a5"
const igual = (a, b) => a[0] === b[0] && a[1] === b[1];
const alea = (l) => l[Math.floor(Math.random() * l.length)];

/* ============================ Tabuleiro ============================ */
class Tabuleiro {
  constructor(g) {
    this.g = g || Tabuleiro.inicial();
  }

  // Azuis em cima, vermelhas em baixo; só o centro fica vazio.
  static inicial() {
    const g = [];
    for (let r = 0; r < N; r++) {
      g.push([]);
      for (let c = 0; c < N; c++) {
        let v = VAZIO;
        if (r < 2) v = AZUL;
        else if (r > 2) v = VERMELHA;
        else if (c < 2) v = AZUL;
        else if (c > 2) v = VERMELHA;
        g[r].push(v);
      }
    }
    return g;
  }

  clone() { return new Tabuleiro(this.g.map((l) => l.slice())); }
  static dentro(r, c) { return r >= 0 && r < N && c >= 0 && c < N; }
  // Diagonais só existem a partir de posições com (r + c) par.
  static temLinha(r, c, dr, dc) { return dr === 0 || dc === 0 || (r + c) % 2 === 0; }

  conta(cor) { return this.g.flat().filter((v) => v === cor).length; }

  pecas(cor) {
    const l = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (this.g[r][c] === cor) l.push([r, c]);
    return l;
  }

  // Destinos de um movimento simples: adjacente, com linha, sem recuar.
  simplesDe(r, c, cor) {
    const res = [];
    for (const [dr, dc] of DIRS) {
      if (dr === -frente(cor)) continue;
      const r2 = r + dr, c2 = c + dc;
      if (Tabuleiro.temLinha(r, c, dr, dc) && Tabuleiro.dentro(r2, c2) && this.g[r2][c2] === VAZIO) res.push([r2, c2]);
    }
    return res;
  }

  // Saltos possíveis (um só salto) a partir de (r,c); vis = posições já ocupadas nesta jogada.
  saltos(r, c, cor, vis) {
    const res = [];
    for (const [dr, dc] of DIRS) {
      if (!Tabuleiro.temLinha(r, c, dr, dc)) continue;
      const mr = r + dr, mc = c + dc, r2 = r + 2 * dr, c2 = c + 2 * dc;
      if (!Tabuleiro.dentro(r2, c2)) continue;
      if (this.g[mr][mc] === oposta(cor) && this.g[r2][c2] === VAZIO && !vis.has(chave(r2, c2))) {
        res.push({ meio: [mr, mc], para: [r2, c2] });
      }
    }
    return res;
  }

  pecasComCaptura(cor) {
    return this.pecas(cor).filter(([r, c]) => this.saltos(r, c, cor, new Set([chave(r, c)])).length > 0);
  }

  movimentosSimples(cor) {
    const l = [];
    for (const [r, c] of this.pecas(cor)) for (const para of this.simplesDe(r, c, cor)) l.push({ de: [r, c], para });
    return l;
  }

  // Todas as capturas (múltiplas) até não haver mais saltos. Cada uma: { de, passos: [{meio, para}] }
  sequencias(cor) {
    const out = [];
    for (const [r, c] of this.pecas(cor)) this._seq([r, c], r, c, cor, new Set([chave(r, c)]), [], out);
    return out;
  }

  _seq(de, r, c, cor, vis, passos, out) {
    const js = this.saltos(r, c, cor, vis);
    if (!js.length) {
      if (passos.length) out.push({ de, passos: passos.slice() });
      return;
    }
    for (const j of js) {
      const [mr, mc] = j.meio, [pr, pc] = j.para;
      this.g[pr][pc] = cor; this.g[r][c] = VAZIO; this.g[mr][mc] = VAZIO;
      vis.add(chave(pr, pc)); passos.push(j);
      this._seq(de, pr, pc, cor, vis, passos, out);
      passos.pop(); vis.delete(chave(pr, pc));
      this.g[r][c] = cor; this.g[pr][pc] = VAZIO; this.g[mr][mc] = oposta(cor);
    }
  }

  aplica(m) {
    let [r, c] = m.de;
    const cor = this.g[r][c];
    if (m.passos) {
      for (const p of m.passos) {
        this.g[r][c] = VAZIO;
        this.g[p.meio[0]][p.meio[1]] = VAZIO;
        this.g[p.para[0]][p.para[1]] = cor;
        [r, c] = p.para;
      }
    } else {
      this.g[r][c] = VAZIO;
      this.g[m.para[0]][m.para[1]] = cor;
    }
  }

  semJogadas(cor) {
    return this.movimentosSimples(cor).length === 0 && this.pecasComCaptura(cor).length === 0;
  }
}

/* ============================== IA ================================= */
class IA {
  constructor(nivel) { this.nivel = nivel; }

  // Nível 1: aleatória. Nível 2: mistura aleatório / preferir capturas. Nível 3: minimax.
  escolhe(tab, cor) {
    const caps = tab.sequencias(cor);
    const todos = caps.concat(tab.movimentosSimples(cor));
    if (!todos.length) return null;
    if (this.nivel === 1) return alea(todos);
    if (this.nivel === 2) return caps.length && Math.random() < 0.6 ? alea(caps) : alea(todos);
    return this.minimax(tab, cor, 4);
  }

  // Probabilidade de soprar uma peça quando é possível.
  decideSoprar() { return Math.random() < { 1: 0.3, 2: 0.7, 3: 1 }[this.nivel]; } // 30% probabilidade na dif facil, 70% no medio e 100% no dificil

  // Na pesquisa a captura é sempre obrigatória.
  static movs(t, cor) {
    const caps = t.sequencias(cor);
    return caps.length ? caps : t.movimentosSimples(cor);
  }

  static avalia(t, cor) {
    let s = 0;
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const v = t.g[r][c];
        if (!v) continue;
        const avanco = v === AZUL ? r : N - 1 - r;
        s += (v === cor ? 1 : -1) * (100 + 3 * avanco);
      }
    }
    return s;
  }

  static negamax(t, cor, prof, alfa, beta) {
    if (prof === 0) return IA.avalia(t, cor);
    const movs = IA.movs(t, cor);
    if (!movs.length) return -10000 - prof;      // sem jogadas: perde (quanto mais cedo, pior)
    let melhor = -Infinity;
    for (const m of movs) {
      const c = t.clone();
      c.aplica(m);
      melhor = Math.max(melhor, -IA.negamax(c, oposta(cor), prof - 1, -beta, -alfa));
      alfa = Math.max(alfa, melhor);
      if (alfa >= beta) break;
    }
    return melhor;
  }

  minimax(tab, cor, prof) {
    const movs = IA.movs(tab, cor).sort(() => Math.random() - 0.5);   // desempate aleatório
    let melhor = null, vm = -Infinity;
    for (const m of movs) {
      const c = tab.clone();
      c.aplica(m);
      const v = -IA.negamax(c, oposta(cor), prof - 1, -Infinity, Infinity);
      if (v > vm) { vm = v; melhor = m; }
    }
    return melhor;
  }
}

/* ============================ Interface ============================ */
const pct = (i) => (40 + 100 * i) / 4.8;     // posição (em %) da linha/coluna i dentro do tabuleiro

// Cria um <div> com a classe dada
const mk = (cls, estilo = {}) => {
  const e = document.createElement("div");
  e.className = cls;
  Object.assign(e.style, estilo);
  return e;
};
// <div> centrado na posição (linha r, coluna c); guarda as coordenadas para o clique
const noPonto = (cls, r, c) => {
  const e = mk(cls, { left: pct(c) + "%", top: pct(r) + "%" });
  e.dataset.r = r;
  e.dataset.c = c;
  return e;
};
// segmento de linha: centro (cx,cy) em %, comprimento em % e ângulo em graus
const linha = (cx, cy, comp, ang) =>
  mk("linha", { left: cx + "%", top: cy + "%", width: comp + "%", transform: `translate(-50%, -50%) rotate(${ang}deg)` });
const $ = (id) => document.getElementById(id);
const CHAVE_CLASSIF = "alquerque.classificacoes";
const MAX_LOG = 30;      // máximo de linhas no registo de movimentos
const descreve = (m) => (m.passos ? [nome(m.de), ...m.passos.map((p) => nome(p.para))].join("×") : nome(m.de) + "-" + nome(m.para));

class Jogo {
  constructor() {
    this.humano = VERMELHA;
    this.pc = AZUL;
    this.ativo = false;
    this.tab = new Tabuleiro();
    this.sopravel = [];     // peças do último jogador a mover que podem ser sopradas
    this.sel = null;        // peça selecionada
    this.seq = null;        // captura múltipla em curso
    this.vez = this.humano;
    this.nota = "";
    this.numeroRonda = 0;
    this.caixa = $("tabuleiro");
    this.constroiTabuleiro();
    this.Eventos();
    this.renderClassificacoes();
    this.atualiza();
    this.msg("Carrega em «Novo jogo» para começar.");
  }

  constroiTabuleiro() {
    const t = this.caixa;
    t.replaceChildren();
    // zonas de clique (por baixo de tudo)
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) t.append(noPonto("hit", r, c));
    // linhas horizontais e verticais
    const comp = pct(4) - pct(0);
    for (let i = 0; i < N; i++) t.append(linha(50, pct(i), comp, 0), linha(pct(i), 50, comp, 90));
    // diagonais grandes e losango
    t.append(linha(50, 50, comp * Math.SQRT2, 45), linha(50, 50, comp * Math.SQRT2, -45));
    const lado = (comp * Math.SQRT2) / 2;
    t.append(linha(pct(3), pct(1), lado, 45), linha(pct(3), pct(3), lado, -45),
             linha(pct(1), pct(3), lado, 45), linha(pct(1), pct(1), lado, -45));
    // as 25 posições
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) t.append(noPonto("ponto", r, c));
    // camadas dinâmicas: marcas de destino e peças (redesenhadas a cada alteração)
    this.gMarcas = mk("camada");
    this.gPecas = mk("camada");
    t.append(this.gMarcas, this.gPecas);
  }

  Eventos() {
    this.caixa.addEventListener("click", (e) => {
      const el = e.target.closest("[data-r]");
      if (el) this.clique(Number(el.dataset.r), Number(el.dataset.c));
    });
    $("btn-novo").addEventListener("click", () => this.novo());
    $("btn-empate").addEventListener("click", () => this.empate());
    $("btn-desistir").addEventListener("click", () => this.desistir());
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") location.hash = ""; });
  }

  /* ---------- desenho ---------- */
  desenha() {
    this.gMarcas.replaceChildren();
    this.gPecas.replaceChildren();
    const mostraSopro = this.ativo && this.vez === this.humano && !this.jaSoprou && !this.sel && !this.seq;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const v = this.tab.g[r][c];
      if (!v) continue;
      let cls = "peca " + (v === AZUL ? "azul" : "vermelha");
      if (this.sel && igual(this.sel, [r, c])) cls += " sel";
      else if (mostraSopro && this.sopravel.some((p) => igual(p, [r, c]))) cls += " sopravel";
      this.gPecas.append(noPonto(cls, r, c));
    }
    for (const [r, c] of this.destinos()) this.gMarcas.append(noPonto("destino", r, c));
  }

  destinos() {
    if (!this.ativo || this.vez !== this.humano || !this.sel) return [];
    const [r, c] = this.sel;
    const vis = this.seq ? this.seq.vis : new Set([chave(r, c)]);
    const saltos = this.tab.saltos(r, c, this.humano, vis).map((j) => j.para);
    return this.seq ? saltos : this.tab.simplesDe(r, c, this.humano).concat(saltos);
  }

  atualiza() {
    $("n-azul").textContent = this.tab.conta(AZUL);
    $("n-vermelha").textContent = this.tab.conta(VERMELHA);
    $("jog-azul").classList.toggle("ativo", this.ativo && this.vez === AZUL);
    $("jog-vermelha").classList.toggle("ativo", this.ativo && this.vez === VERMELHA);
    $("btn-empate").textContent = this.empateProposto ? "Aceitar empate" : "Propor empate";
    let modo = "inativo";
    if (this.ativo) modo = this.vez !== this.humano ? "espera" : this.seq ? "captura" : this.sel ? "destino" : "selecionar";
    this.caixa.dataset.modo = modo;       // o CSS muda o cursor consoante o modo
    this.desenha();
  }

  msg(t) { $("mensagens").textContent = t; }

  // Histórico Movimentos

  log(t, cor) {
    const lista = $("lista-movimentos");
    if (cor !== VERMELHA && cor !== AZUL) {
      const evento = document.createElement("li");
      evento.className = "evento-movimento";
      evento.textContent = t;
      lista.append(evento);
      while (lista.children.length > MAX_LOG) lista.firstElementChild.remove();
      return;
    }

    const rondas = lista.querySelectorAll(".linha-movimentos");
    const ultimaLinha = rondas[rondas.length - 1];

    let celula;

    if (ultimaLinha) {
      if (cor === VERMELHA) {
        celula = ultimaLinha.querySelector(".vermelhas");
      } else if (cor === AZUL) {
        celula = ultimaLinha.querySelector(".azuis");
      }
    }

    if (celula && celula.textContent === "") {
      celula.textContent = t;
      const vermelha = ultimaLinha.querySelector(".vermelhas");
      const azul = ultimaLinha.querySelector(".azuis");

      if (vermelha.textContent !== "" && azul.textContent !== "") {
        ultimaLinha.classList.add("ronda-completa");
      }
      return;
    }

    const li = document.createElement("li");
    li.className = "linha-movimentos";
    const numero = document.createElement("div");
    numero.className = "numero";
    this.numeroRonda++;
    numero.textContent = `${this.numeroRonda}.`;

    const vermelhas = document.createElement("div");
    vermelhas.className = "jogada vermelhas";

    const azuis = document.createElement("div");
    azuis.className = "jogada azuis";

    if (cor === VERMELHA) {
      vermelhas.textContent = t;
    } else if (cor === AZUL) {
      azuis.textContent = t;
    }

    li.append(numero, vermelhas, azuis);

    lista.append(li);
    while (lista.children.length > MAX_LOG) lista.firstElementChild.remove();   // apaga as mais antigas
  }

  /* ---------- fluxo do jogo ---------- */
  novo() {
    clearTimeout(this.timer);
    this.tab = new Tabuleiro();
    this.nivel = Number($("cfg-nivel").value);
    this.ia = new IA(this.nivel);
    this.vez = Number($("cfg-primeiro").value);
    this.ativo = true;
    this.sopravel = [];
    this.semCaptura = 0;
    this.proximaProposta = 30;
    this.empateProposto = false;
    this.nota = "";
    this.numeroRonda = 0;
    $("lista-movimentos").replaceChildren();
    this.iniciaJogada();
  }

  iniciaJogada() {
    this.sel = null;
    this.seq = null;
    this.jaSoprou = false;
    if (this.tab.semJogadas(this.vez)) {
      return this.fim(oposta(this.vez), `${NOME[this.vez]} sem jogadas válidas.`);
    }
    this.capsInicio = this.tab.pecasComCaptura(this.vez);
    if (this.vez === this.humano) {
      if (this.semCaptura >= this.proximaProposta) {
        this.empateProposto = true;
        this.proximaProposta += 20;
        this.nota += " O computador propõe empate («Aceitar empate» para aceitar).";
      }
      let t = `${this.nota} A tua vez.`;
      if (this.sopravel.length) t += " Podes soprar uma peça assinalada a laranja antes de jogar.";
      if (this.capsInicio.length) t += " Tens captura obrigatória (se jogares sem capturar, o computador pode soprar).";
      this.nota = "";
      this.msg(t.trim());
      this.atualiza();
    } else {
      this.atualiza();
      this.msg(`${this.nota} O computador está a pensar…`.trim());
      this.timer = setTimeout(() => this.jogaPC(), 700);
    }
  }

  // Fim da jogada de this.vez: calcula as peças sopráveis e passa a vez.
  terminaJogada(mov) {
    const cor = this.vez;
    let pos = [];
    if (mov.passos) {
      const vis = new Set([chave(...mov.de), ...mov.passos.map((p) => chave(...p.para))]);
      const fim = mov.passos[mov.passos.length - 1].para;
      if (this.tab.saltos(fim[0], fim[1], cor, vis).length) pos = [fim];   // parou com captura possível
      this.semCaptura = 0;
      this.proximaProposta = 30;
    } else {
      // jogou sem capturar: as peças que podiam capturar são sopráveis (a que se moveu, na nova posição)
      pos = this.capsInicio.map((p) => (igual(p, mov.de) ? mov.para : p));
      this.semCaptura++;
    }
    this.sopravel = pos;
    if (cor === this.humano) this.empateProposto = false;
    this.vez = oposta(cor);
    this.iniciaJogada();
  }

  /* ---------- interação do jogador (modos do tabuleiro) ---------- */
  clique(r, c) {
    if (!this.ativo || this.vez !== this.humano) return;
    const h = this.humano;
    const v = this.tab.g[r][c];

    if (this.seq) return this.cliqueSequencia(r, c);

    if (v === oposta(h)) {                       // peça do adversário
      if (!this.sel && !this.jaSoprou && this.sopravel.some((p) => igual(p, [r, c]))) return this.soprar(r, c);
      return this.msg(this.sel ? "Destino inválido: escolhe uma posição assinalada a verde." : "Essa peça não pode ser soprada.");
    }
    if (v === h) {                               // seleciona (ou troca) a peça a jogar
      this.sel = [r, c];
      this.msg(`Peça ${nome(this.sel)} selecionada. Escolhe o destino (assinalado a verde) ou outra peça tua.`);
      return this.atualiza();
    }
    if (!this.sel) return this.msg("Seleciona primeiro uma das tuas peças.");

    const [sr, sc] = this.sel;
    if (this.tab.simplesDe(sr, sc, h).some((p) => igual(p, [r, c]))) {      // movimento simples
      const mov = { de: this.sel, para: [r, c] };
      this.tab.aplica(mov);
      this.log(`${NOME[h]}: ${descreve(mov)}`, h);
      return this.terminaJogada(mov);
    }
    const salto = this.tab.saltos(sr, sc, h, new Set([chave(sr, sc)])).find((j) => igual(j.para, [r, c]));
    if (salto) {                                 // primeira captura
      this.seq = { de: [sr, sc], vis: new Set([chave(sr, sc)]), passos: [] };
      return this.saltaSeq(salto);
    }
    this.msg("Jogada inválida: só podes mover para uma posição ligada por linha, sem recuar, ou saltar sobre uma peça adversária.");
  }

  cliqueSequencia(r, c) {
    const [ar, ac] = this.sel;
    if (igual(this.sel, [r, c])) return this.fimSequencia();
    const salto = this.tab.saltos(ar, ac, this.humano, this.seq.vis).find((j) => igual(j.para, [r, c]));
    if (salto) return this.saltaSeq(salto);
    this.msg("Captura inválida. Escolhe uma posição assinalada ou clica na peça para terminar a jogada.");
  }

  saltaSeq(j) {
    const h = this.humano;
    const [r, c] = this.sel;
    this.tab.g[r][c] = VAZIO;
    this.tab.g[j.meio[0]][j.meio[1]] = VAZIO;
    this.tab.g[j.para[0]][j.para[1]] = h;
    this.seq.vis.add(chave(...j.para));
    this.seq.passos.push(j);
    this.sel = j.para;
    if (!this.tab.saltos(j.para[0], j.para[1], h, this.seq.vis).length) return this.fimSequencia();
    this.msg("Captura feita. Há mais capturas possíveis: escolhe a seguinte (verde) ou clica na peça para terminar.");
    this.atualiza();
  }

  fimSequencia() {
    const mov = { de: this.seq.de, passos: this.seq.passos };
    this.log(`${NOME[this.humano]}: ${descreve(mov)}`, this.humano);
    this.seq = null;
    this.sel = null;
    this.terminaJogada(mov);
  }

  soprar(r, c) {
    this.tab.g[r][c] = VAZIO;
    this.jaSoprou = true;
    this.sopravel = [];
    this.capsInicio = this.tab.pecasComCaptura(this.vez);
    this.log(`${NOME[this.humano]} sopram ${nome([r, c])}`);
    this.msg(`Sopraste a peça em ${nome([r, c])}. Agora faz a tua jogada.`);
    this.atualiza();
  }

  /* ---------- computador ---------- */
  jogaPC() {
    if (!this.ativo) return;
    let nota = "";
    if (this.sopravel.length && this.ia.decideSoprar()) {
      const p = alea(this.sopravel);
      this.tab.g[p[0]][p[1]] = VAZIO;
      this.sopravel = [];
      this.capsInicio = this.tab.pecasComCaptura(this.pc);
      this.log(`${NOME[this.pc]} sopram ${nome(p)}`);
      nota = `O computador soprou a tua peça em ${nome(p)}. `;
    }
    const mov = this.ia.escolhe(this.tab, this.pc);
    if (!mov) return this.fim(this.humano, "O computador ficou sem jogadas.");
    this.tab.aplica(mov);
    this.log(`${NOME[this.pc]}: ${descreve(mov)}`, this.pc);
    this.nota = `${nota}O computador jogou ${descreve(mov)}.`;
    this.terminaJogada(mov);
  }

  /* ---------- comandos ---------- */
  empate() {
    if (!this.ativo) return this.msg("Não há jogo a decorrer.");
    if (this.vez !== this.humano) return this.msg("Só podes propor empate na tua vez.");
    if (this.empateProposto) return this.fim(null, "Empate por acordo.");
    if (this.tab.conta(this.pc) <= this.tab.conta(this.humano)) return this.fim(null, "O computador aceitou o empate.");
    this.msg("O computador recusou o empate.");
  }

  desistir() {
    if (!this.ativo) return this.msg("Não há jogo a decorrer.");
    this.fim(this.pc, "Desististe do jogo.");
  }

  fim(vencedor, motivo) {
    clearTimeout(this.timer);
    this.ativo = false;
    this.seq = null;
    this.sel = null;
    this.empateProposto = false;
    const t = vencedor === null ? "Empate. " : vencedor === this.humano ? "Ganhaste! " : "Perdeste. ";
    this.msg(t + motivo + " Carrega em «Novo jogo» para jogar outra vez.");
    this.log(t + motivo);
    this.regista(vencedor);
    this.atualiza();
  }

  /* ---------- classificações (localStorage; só jogos contra o computador) ---------- */
  static lerClassif() {
    try { return JSON.parse(localStorage.getItem(CHAVE_CLASSIF)) || {}; } catch (e) { return {}; }
  }

  regista(vencedor) {
    const d = Jogo.lerClassif();
    const e = d[this.nivel] || { v: 0, d: 0, e: 0 };
    e[vencedor === null ? "e" : vencedor === this.humano ? "v" : "d"]++;
    d[this.nivel] = e;
    try { localStorage.setItem(CHAVE_CLASSIF, JSON.stringify(d)); } catch (err) { /* sem armazenamento */ }
    this.renderClassificacoes();
  }

  renderClassificacoes() {
    const d = Jogo.lerClassif();
    const corpo = $("tab-classificacoes");
    corpo.replaceChildren();
    for (const n in NIVEIS) {
      const e = d[n] || { v: 0, d: 0, e: 0 };
      const tr = document.createElement("tr");
      for (const x of [NIVEIS[n], e.v, e.d, e.e]) {
        const td = document.createElement("td");
        td.textContent = x;
        tr.append(td);
      }
      corpo.append(tr);
    }
  }
}

new Jogo();
