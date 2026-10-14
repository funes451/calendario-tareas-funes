const CONFIG = {
  SUPABASE_URL: "https://igevbjfallgxeczcynql.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable__ie84quX7V1wRYJgmt7kBA_tUSVfqVd"
};

const RESPONSABLES = ["Eli", "Marti", "David"];
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const ORDEN_PRIORIDAD = { alta: 0, media: 1, baja: 2 };
const LIMITES = { anioInicio: 2026, mesInicio: 9, anioFin: 2027, mesFin: 11 };

const FechaUtil = {
  aISO(fecha) {
    const mes = String(fecha.getMonth() + 1).padStart(2, "0");
    const dia = String(fecha.getDate()).padStart(2, "0");
    return fecha.getFullYear() + "-" + mes + "-" + dia;
  },
  desdeISO(iso) {
    const partes = iso.split("-").map(Number);
    return new Date(partes[0], partes[1] - 1, partes[2]);
  },
  hoyISO() {
    return this.aISO(new Date());
  },
  sumarDias(iso, dias) {
    const fecha = this.desdeISO(iso);
    fecha.setDate(fecha.getDate() + dias);
    return this.aISO(fecha);
  },
  formatoCorto(iso) {
    const fecha = this.desdeISO(iso);
    return fecha.getDate() + " " + MESES[fecha.getMonth()].slice(0, 3).toLowerCase();
  },
  formatoLargo(iso) {
    const fecha = this.desdeISO(iso);
    return fecha.getDate() + " de " + MESES[fecha.getMonth()].toLowerCase() + " de " + fecha.getFullYear();
  }
};

const TareaUtil = {
  fechaReferencia(tarea) {
    return tarea.fecha_fin || tarea.fecha_inicio;
  },
  estaVencida(tarea) {
    return tarea.estado !== "hecho" && this.fechaReferencia(tarea) < FechaUtil.hoyISO();
  },
  esUrgente(tarea) {
    if (tarea.estado === "hecho") return false;
    if (tarea.prioridad === "alta") return true;
    return tarea.fecha_inicio <= FechaUtil.sumarDias(FechaUtil.hoyISO(), 7);
  },
  ocurreEnDia(tarea, iso) {
    return tarea.fecha_inicio <= iso && iso <= this.fechaReferencia(tarea);
  },
  comparar(a, b) {
    if (a.fecha_inicio !== b.fecha_inicio) return a.fecha_inicio < b.fecha_inicio ? -1 : 1;
    if (ORDEN_PRIORIDAD[a.prioridad] !== ORDEN_PRIORIDAD[b.prioridad]) return ORDEN_PRIORIDAD[a.prioridad] - ORDEN_PRIORIDAD[b.prioridad];
    return a.titulo.localeCompare(b.titulo);
  },
  compararAgenda(a, b) {
    const vencidaA = TareaUtil.estaVencida(a) ? 0 : 1;
    const vencidaB = TareaUtil.estaVencida(b) ? 0 : 1;
    if (vencidaA !== vencidaB) return vencidaA - vencidaB;
    return TareaUtil.comparar(a, b);
  }
};

class AlmacenIdentidad {
  constructor(clave) {
    this.clave = clave;
  }
  obtener() {
    try {
      const valor = localStorage.getItem(this.clave);
      return RESPONSABLES.includes(valor) ? valor : null;
    } catch (error) {
      return null;
    }
  }
  guardar(nombre) {
    try {
      localStorage.setItem(this.clave, nombre);
    } catch (error) {}
  }
  limpiar() {
    try {
      localStorage.removeItem(this.clave);
    } catch (error) {}
  }
}

class RepositorioTareas {
  constructor(cliente) {
    this.cliente = cliente;
  }
  async listar() {
    const { data, error } = await this.cliente.from("tareas").select("*").order("fecha_inicio", { ascending: true });
    if (error) throw error;
    return data;
  }
  async crear(tarea) {
    const { data, error } = await this.cliente.from("tareas").insert(tarea).select().single();
    if (error) throw error;
    return data;
  }
  async actualizar(id, cambios) {
    const { data, error } = await this.cliente.from("tareas").update(cambios).eq("id", id).select().single();
    if (error) throw error;
    return data;
  }
  async borrar(id) {
    const { error } = await this.cliente.from("tareas").delete().eq("id", id);
    if (error) throw error;
  }
  suscribir(manejador) {
    return this.cliente
      .channel("tareas-tiempo-real")
      .on("postgres_changes", { event: "*", schema: "public", table: "tareas" }, manejador)
      .subscribe();
  }
}

class AlmacenTareas {
  constructor() {
    this.tareas = [];
    this.oyentes = new Set();
  }
  suscribir(oyente) {
    this.oyentes.add(oyente);
  }
  notificar() {
    this.oyentes.forEach(oyente => oyente(this.tareas));
  }
  establecer(tareas) {
    this.tareas = [...tareas];
    this.notificar();
  }
  insertar(tarea) {
    if (this.tareas.some(t => t.id === tarea.id)) return;
    this.tareas.push(tarea);
    this.notificar();
  }
  reemplazar(tarea) {
    this.tareas = this.tareas.map(t => (t.id === tarea.id ? tarea : t));
    this.notificar();
  }
  eliminar(id) {
    this.tareas = this.tareas.filter(t => t.id !== id);
    this.notificar();
  }
  aplicarEvento(evento) {
    if (evento.eventType === "INSERT") this.insertar(evento.new);
    if (evento.eventType === "UPDATE") this.reemplazar(evento.new);
    if (evento.eventType === "DELETE") this.eliminar(evento.old.id);
  }
  proyectos() {
    const nombres = this.tareas.map(t => t.proyecto).filter(Boolean);
    return [...new Set(nombres)].sort((a, b) => a.localeCompare(b));
  }
}

class EstadoFiltros {
  constructor() {
    this.valores = { estado: "", prioridad: "", proyecto: "" };
    this.oyentes = new Set();
  }
  suscribir(oyente) {
    this.oyentes.add(oyente);
  }
  establecer(campo, valor) {
    this.valores[campo] = valor;
    this.oyentes.forEach(oyente => oyente());
  }
  limpiar() {
    this.valores = { estado: "", prioridad: "", proyecto: "" };
    this.oyentes.forEach(oyente => oyente());
  }
  cumple(tarea) {
    const v = this.valores;
    if (v.estado && tarea.estado !== v.estado) return false;
    if (v.prioridad && tarea.prioridad !== v.prioridad) return false;
    if (v.proyecto && (tarea.proyecto || "") !== v.proyecto) return false;
    return true;
  }
  aplicar(tareas) {
    return tareas.filter(t => this.cumple(t));
  }
}

const Dom = {
  crear(etiqueta, clase, texto) {
    const elemento = document.createElement(etiqueta);
    if (clase) elemento.className = clase;
    if (texto !== undefined) elemento.textContent = texto;
    return elemento;
  },
  claseUsuario(responsable) {
    return "usuario-" + responsable.toLowerCase();
  }
};

class Avisador {
  constructor() {
    this.elemento = document.getElementById("aviso");
    this.temporizador = null;
  }
  mostrar(texto, esError, persistente) {
    this.elemento.textContent = texto;
    this.elemento.classList.toggle("error", Boolean(esError));
    this.elemento.classList.remove("oculto");
    clearTimeout(this.temporizador);
    if (!persistente) {
      this.temporizador = setTimeout(() => this.elemento.classList.add("oculto"), 3500);
    }
  }
}

class ModalTarea {
  constructor(manejadores) {
    this.overlay = document.getElementById("modal-tarea");
    this.formulario = document.getElementById("formulario-tarea");
    this.titulo = document.getElementById("titulo-modal");
    this.botonEliminar = document.getElementById("boton-eliminar");
    this.botonCancelar = document.getElementById("boton-cancelar");
    this.datalist = document.getElementById("lista-proyectos");
    this.manejadores = manejadores;
    this.confirmandoBorrado = false;
    this.formulario.addEventListener("submit", evento => {
      evento.preventDefault();
      this.manejadores.alGuardar(this.leer());
    });
    this.botonCancelar.addEventListener("click", () => this.cerrar());
    this.botonEliminar.addEventListener("click", () => this.gestionarBorrado());
    this.overlay.addEventListener("click", evento => {
      if (evento.target === this.overlay) this.cerrar();
    });
    document.addEventListener("keydown", evento => {
      if (evento.key === "Escape") this.cerrar();
    });
  }
  abrirNueva(fechaInicio) {
    this.formulario.reset();
    this.formulario.elements.id.value = "";
    this.formulario.elements.fecha_inicio.value = fechaInicio;
    this.titulo.textContent = "Nueva tarea";
    this.botonEliminar.classList.add("oculto");
    this.reiniciarBorrado();
    this.abrir();
  }
  abrirEdicion(tarea) {
    this.formulario.reset();
    this.formulario.elements.id.value = tarea.id;
    this.formulario.elements.titulo.value = tarea.titulo;
    this.formulario.elements.descripcion.value = tarea.descripcion || "";
    this.formulario.elements.fecha_inicio.value = tarea.fecha_inicio;
    this.formulario.elements.fecha_fin.value = tarea.fecha_fin || "";
    this.formulario.elements.prioridad.value = tarea.prioridad;
    this.formulario.elements.estado.value = tarea.estado;
    this.formulario.elements.proyecto.value = tarea.proyecto || "";
    this.titulo.textContent = "Editar tarea";
    this.botonEliminar.classList.remove("oculto");
    this.reiniciarBorrado();
    this.abrir();
  }
  leer() {
    const datos = new FormData(this.formulario);
    return {
      id: datos.get("id") || null,
      titulo: String(datos.get("titulo") || "").trim(),
      descripcion: String(datos.get("descripcion") || "").trim() || null,
      fecha_inicio: datos.get("fecha_inicio"),
      fecha_fin: datos.get("fecha_fin") || null,
      responsable: "David",
      prioridad: datos.get("prioridad"),
      estado: datos.get("estado"),
      proyecto: String(datos.get("proyecto") || "").trim() || null
    };
  }
  gestionarBorrado() {
    if (!this.confirmandoBorrado) {
      this.confirmandoBorrado = true;
      this.botonEliminar.textContent = "¿Confirmar borrado?";
      return;
    }
    this.manejadores.alEliminar(this.formulario.elements.id.value);
  }
  reiniciarBorrado() {
    this.confirmandoBorrado = false;
    this.botonEliminar.textContent = "Eliminar";
  }
  actualizarProyectos(proyectos) {
    this.datalist.replaceChildren(...proyectos.map(nombre => new Option(nombre)));
  }
  abrir() {
    this.overlay.classList.remove("oculto");
    this.formulario.elements.titulo.focus();
  }
  cerrar() {
    this.overlay.classList.add("oculto");
    this.reiniciarBorrado();
  }
}

class VistaCalendario {
  constructor(alPulsarDia, alPulsarTarea) {
    this.cuadricula = document.getElementById("cuadricula-calendario");
    this.alPulsarDia = alPulsarDia;
    this.alPulsarTarea = alPulsarTarea;
  }
  render(anio, mes, tareas) {
    this.cuadricula.replaceChildren();
    const desplazamiento = (new Date(anio, mes, 1).getDay() + 6) % 7;
    const totalDias = new Date(anio, mes + 1, 0).getDate();
    const hoy = FechaUtil.hoyISO();
    for (let i = 0; i < desplazamiento; i++) {
      this.cuadricula.appendChild(Dom.crear("div", "celda vacia"));
    }
    for (let dia = 1; dia <= totalDias; dia++) {
      const iso = FechaUtil.aISO(new Date(anio, mes, dia));
      const celda = Dom.crear("div", "celda" + (iso === hoy ? " hoy" : ""));
      celda.appendChild(Dom.crear("div", "numero-dia", String(dia)));
      const tareasDia = tareas.filter(t => TareaUtil.ocurreEnDia(t, iso)).sort(TareaUtil.comparar);
      tareasDia.forEach(tarea => celda.appendChild(this.crearChip(tarea)));
      celda.addEventListener("click", () => this.alPulsarDia(iso));
      this.cuadricula.appendChild(celda);
    }
  }
  crearChip(tarea) {
    const clases = ["chip", Dom.claseUsuario(tarea.responsable), "prioridad-" + tarea.prioridad];
    if (tarea.estado === "hecho") clases.push("hecha");
    const chip = Dom.crear("button", clases.join(" "), tarea.titulo);
    chip.type = "button";
    chip.title = tarea.titulo + " · " + tarea.responsable + " · prioridad " + tarea.prioridad;
    chip.addEventListener("click", evento => {
      evento.stopPropagation();
      this.alPulsarTarea(tarea);
    });
    return chip;
  }
}

class VistaAgenda {
  constructor(alPulsarTarea) {
    this.lista = document.getElementById("lista-agenda");
    this.alPulsarTarea = alPulsarTarea;
  }
  render(tareas, hayFiltroEstado) {
    this.lista.replaceChildren();
    const visibles = tareas
      .filter(t => (hayFiltroEstado ? true : t.estado !== "hecho"))
      .sort(TareaUtil.compararAgenda);
    if (visibles.length === 0) {
      this.lista.appendChild(Dom.crear("p", "mensaje-vacio", "No hay tareas que mostrar."));
      return;
    }
    visibles.forEach(tarea => this.lista.appendChild(this.crearFila(tarea)));
  }
  crearFila(tarea) {
    const fila = Dom.crear("article", "fila-agenda" + (TareaUtil.estaVencida(tarea) ? " vencida" : ""));
    const fechas = tarea.fecha_fin
      ? FechaUtil.formatoCorto(tarea.fecha_inicio) + " → " + FechaUtil.formatoCorto(tarea.fecha_fin)
      : FechaUtil.formatoCorto(tarea.fecha_inicio);
    fila.appendChild(Dom.crear("div", "fecha-agenda", fechas));
    const cuerpo = Dom.crear("div", "cuerpo-agenda");
    cuerpo.appendChild(Dom.crear("div", "titulo-agenda", tarea.titulo));
    if (tarea.descripcion) cuerpo.appendChild(Dom.crear("div", "descripcion-agenda", tarea.descripcion));
    const insignias = Dom.crear("div", "insignias");
    insignias.appendChild(Dom.crear("span", "insignia prioridad-" + tarea.prioridad, "Prioridad " + tarea.prioridad));
    insignias.appendChild(Dom.crear("span", "insignia estado", tarea.estado));
    if (tarea.proyecto) insignias.appendChild(Dom.crear("span", "insignia proyecto", tarea.proyecto));
    if (TareaUtil.estaVencida(tarea)) insignias.appendChild(Dom.crear("span", "insignia atrasada", "Atrasada"));
    cuerpo.appendChild(insignias);
    fila.appendChild(cuerpo);
    fila.addEventListener("click", () => this.alPulsarTarea(tarea));
    return fila;
  }
}

class VistaUrgente {
  constructor(alPulsarTarea) {
    this.lista = document.getElementById("lista-urgente");
    this.alPulsarTarea = alPulsarTarea;
  }
  render(tareas) {
    this.lista.replaceChildren();
    const urgentes = tareas.filter(t => TareaUtil.esUrgente(t)).sort(TareaUtil.compararAgenda);
    if (urgentes.length === 0) {
      this.lista.appendChild(Dom.crear("p", "mensaje-vacio", "Sin tareas urgentes esta semana."));
      return;
    }
    urgentes.forEach(tarea => {
      const elemento = Dom.crear("button", "elemento-urgente " + Dom.claseUsuario(tarea.responsable));
      elemento.type = "button";
      elemento.appendChild(Dom.crear("span", "fecha-urgente", FechaUtil.formatoCorto(tarea.fecha_inicio)));
      elemento.appendChild(Dom.crear("span", "titulo-urgente", tarea.titulo));
      elemento.appendChild(Dom.crear("span", "punto-prioridad prioridad-" + tarea.prioridad));
      elemento.addEventListener("click", () => this.alPulsarTarea(tarea));
      this.lista.appendChild(elemento);
    });
  }
}

class VistaResumen {
  constructor() {
    this.elemento = document.getElementById("resumen-tareas");
  }
  render(tareas) {
    const pendientes = tareas.filter(t => t.estado === "pendiente").length;
    const enCurso = tareas.filter(t => t.estado === "en curso").length;
    const hechas = tareas.filter(t => t.estado === "hecho").length;
    this.elemento.textContent = pendientes + " pendientes · " + enCurso + " en curso · " + hechas + " hechas";
  }
}

class Aplicacion {
  constructor(cliente) {
    this.identidad = new AlmacenIdentidad("calendario_funes_usuario");
    this.repositorio = new RepositorioTareas(cliente);
    this.almacen = new AlmacenTareas();
    this.filtros = new EstadoFiltros();
    this.avisador = new Avisador();
    this.vistaActiva = "calendario";
    this.proyectosRenderizados = "";
    const hoy = new Date();
    this.mesVista = this.ajustarMes(hoy.getFullYear(), hoy.getMonth());
    this.modal = new ModalTarea({
      alGuardar: datos => this.guardar(datos),
      alEliminar: id => this.eliminar(id)
    });
    this.vistaCalendario = new VistaCalendario(
      iso => this.modal.abrirNueva(iso),
      tarea => this.modal.abrirEdicion(tarea)
    );
    this.vistaAgenda = new VistaAgenda(tarea => this.modal.abrirEdicion(tarea));
    this.vistaUrgente = new VistaUrgente(tarea => this.modal.abrirEdicion(tarea));
    this.vistaResumen = new VistaResumen();
  }
  async iniciar() {
    this.configurarIdentidad();
    this.configurarNavegacion();
    this.configurarFiltros();
    this.almacen.suscribir(() => this.render());
    this.filtros.suscribir(() => this.render());
    this.render();
    try {
      const tareas = await this.repositorio.listar();
      this.almacen.establecer(tareas);
    } catch (error) {
      this.avisador.mostrar("No se pudieron cargar las tareas: " + error.message, true, true);
    }
    this.repositorio.suscribir(evento => this.almacen.aplicarEvento(evento));
  }
  configurarIdentidad() {
    const overlay = document.getElementById("seleccion-identidad");
    const usuario = this.identidad.obtener();
    if (usuario) {
      this.mostrarUsuario(usuario);
    } else {
      overlay.classList.remove("oculto");
    }
    overlay.querySelectorAll("[data-usuario]").forEach(boton => {
      boton.addEventListener("click", () => {
        this.identidad.guardar(boton.dataset.usuario);
        this.mostrarUsuario(boton.dataset.usuario);
        overlay.classList.add("oculto");
      });
    });
    document.getElementById("cambiar-usuario").addEventListener("click", () => {
      this.identidad.limpiar();
      overlay.classList.remove("oculto");
    });
    document.getElementById("nueva-tarea").addEventListener("click", () => {
      this.modal.abrirNueva(this.fechaInicialNueva());
    });
  }
  mostrarUsuario(nombre) {
    const insignia = document.getElementById("usuario-actual");
    insignia.textContent = nombre;
    insignia.className = "insignia-usuario " + Dom.claseUsuario(nombre);
  }
  fechaInicialNueva() {
    const hoy = FechaUtil.hoyISO();
    if (hoy < "2026-10-01") return "2026-10-14";
    if (hoy > "2027-12-31") return "2027-12-31";
    return hoy;
  }
  configurarNavegacion() {
    const selector = document.getElementById("selector-mes");
    let anio = LIMITES.anioInicio;
    let mes = LIMITES.mesInicio;
    while (anio < LIMITES.anioFin || (anio === LIMITES.anioFin && mes <= LIMITES.mesFin)) {
      selector.appendChild(new Option(MESES[mes] + " " + anio, anio + "-" + mes));
      mes++;
      if (mes > 11) {
        mes = 0;
        anio++;
      }
    }
    selector.addEventListener("change", () => {
      const partes = selector.value.split("-").map(Number);
      this.mesVista = { anio: partes[0], mes: partes[1] };
      this.render();
    });
    document.getElementById("mes-anterior").addEventListener("click", () => this.cambiarMes(-1));
    document.getElementById("mes-siguiente").addEventListener("click", () => this.cambiarMes(1));
    document.getElementById("ir-hoy").addEventListener("click", () => {
      const hoy = new Date();
      this.mesVista = this.ajustarMes(hoy.getFullYear(), hoy.getMonth());
      this.render();
    });
    document.getElementById("pestania-calendario").addEventListener("click", () => this.cambiarVista("calendario"));
    document.getElementById("pestania-agenda").addEventListener("click", () => this.cambiarVista("agenda"));
  }
  cambiarVista(vista) {
    this.vistaActiva = vista;
    document.getElementById("pestania-calendario").classList.toggle("activa", vista === "calendario");
    document.getElementById("pestania-agenda").classList.toggle("activa", vista === "agenda");
    document.getElementById("seccion-calendario").classList.toggle("oculto", vista !== "calendario");
    document.getElementById("seccion-agenda").classList.toggle("oculto", vista !== "agenda");
    this.render();
  }
  cambiarMes(delta) {
    let { anio, mes } = this.mesVista;
    mes += delta;
    if (mes < 0) {
      mes = 11;
      anio--;
    }
    if (mes > 11) {
      mes = 0;
      anio++;
    }
    this.mesVista = this.ajustarMes(anio, mes);
    this.render();
  }
  ajustarMes(anio, mes) {
    const valor = anio * 12 + mes;
    const minimo = LIMITES.anioInicio * 12 + LIMITES.mesInicio;
    const maximo = LIMITES.anioFin * 12 + LIMITES.mesFin;
    const ajustado = Math.min(Math.max(valor, minimo), maximo);
    return { anio: Math.floor(ajustado / 12), mes: ajustado % 12 };
  }
  configurarFiltros() {
    const campos = [
      ["filtro-estado", "estado"],
      ["filtro-prioridad", "prioridad"],
      ["filtro-proyecto", "proyecto"]
    ];
    campos.forEach(([id, campo]) => {
      document.getElementById(id).addEventListener("change", evento => {
        this.filtros.establecer(campo, evento.target.value);
      });
    });
    document.getElementById("limpiar-filtros").addEventListener("click", () => {
      this.filtros.limpiar();
      campos.forEach(([id]) => {
        document.getElementById(id).value = "";
      });
    });
  }
  actualizarProyectos() {
    const proyectos = this.almacen.proyectos();
    const firma = proyectos.join("|");
    if (firma === this.proyectosRenderizados) return;
    this.proyectosRenderizados = firma;
    const selector = document.getElementById("filtro-proyecto");
    const seleccion = this.filtros.valores.proyecto;
    selector.replaceChildren(new Option("Proyecto: todos", ""));
    proyectos.forEach(nombre => selector.appendChild(new Option(nombre, nombre)));
    selector.value = proyectos.includes(seleccion) ? seleccion : "";
    if (seleccion && !proyectos.includes(seleccion)) this.filtros.valores.proyecto = "";
    this.modal.actualizarProyectos(proyectos);
  }
  render() {
    const filtradas = this.filtros.aplicar(this.almacen.tareas);
    this.actualizarProyectos();
    this.vistaResumen.render(filtradas);
    this.vistaUrgente.render(filtradas);
    this.actualizarControlesMes();
    if (this.vistaActiva === "calendario") {
      this.vistaCalendario.render(this.mesVista.anio, this.mesVista.mes, filtradas);
    } else {
      this.vistaAgenda.render(filtradas, Boolean(this.filtros.valores.estado));
    }
  }
  actualizarControlesMes() {
    const { anio, mes } = this.mesVista;
    document.getElementById("selector-mes").value = anio + "-" + mes;
    const valor = anio * 12 + mes;
    document.getElementById("mes-anterior").disabled = valor <= LIMITES.anioInicio * 12 + LIMITES.mesInicio;
    document.getElementById("mes-siguiente").disabled = valor >= LIMITES.anioFin * 12 + LIMITES.mesFin;
  }
  async guardar(datos) {
    if (!datos.titulo) {
      this.avisador.mostrar("El título es obligatorio", true);
      return;
    }
    if (datos.fecha_fin && datos.fecha_fin < datos.fecha_inicio) {
      this.avisador.mostrar("La fecha de fin no puede ser anterior a la de inicio", true);
      return;
    }
    const { id, ...campos } = datos;
    try {
      if (id) {
        const actualizada = await this.repositorio.actualizar(id, campos);
        this.almacen.reemplazar(actualizada);
      } else {
        const creada = await this.repositorio.crear(campos);
        this.almacen.insertar(creada);
      }
      this.modal.cerrar();
      this.avisador.mostrar("Tarea guardada");
    } catch (error) {
      this.avisador.mostrar("Error al guardar: " + error.message, true);
    }
  }
  async eliminar(id) {
    try {
      await this.repositorio.borrar(id);
      this.almacen.eliminar(id);
      this.modal.cerrar();
      this.avisador.mostrar("Tarea eliminada");
    } catch (error) {
      this.avisador.mostrar("Error al eliminar: " + error.message, true);
    }
  }
}

function iniciar() {
  if (!window.supabase) {
    new Avisador().mostrar("No se pudo cargar la librería de Supabase, revisa la conexión a internet y recarga la página", true, true);
    return;
  }
  const aplicacion = new Aplicacion(window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY));
  aplicacion.iniciar();
}

document.addEventListener("DOMContentLoaded", iniciar);
