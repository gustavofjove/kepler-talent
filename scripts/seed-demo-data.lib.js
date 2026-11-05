// Pure parts of the KTL-40 demo dataset: the fixed tables and the target guard. No I/O here, so
// the frontend unit suite can check the dataset's invariants (tests/unit/seed-demo-data.lib.spec.ts).
// Everything in it is fabricated.

/** Reserved domain of every demo candidate's e-mail; it is how a re-run recognises them. */
const DEMO_DOMAIN = 'demo.kepler-talento.local';

/**
 * 24 fabricated candidates. `availability` is the check to record: a state, how many days ago it
 * was checked, and for some unavailable ones how many days ahead they become available again.
 * `cv` uploads a synthetic one-page PDF as the primary CV. `removed` withdraws them logically
 * afterwards, so the home page has an «inactivos» figure. They are created in this order, so the
 * last ones are «Últimos añadidos».
 */
const CANDIDATES = [
  {
    first: 'Lucía',
    last: 'Martín Ortega',
    city: 'Madrid',
    source: 'LinkedIn',
    availability: ['available', 1],
    cv: true,
  },
  {
    first: 'Hugo',
    last: 'Serrano Gil',
    city: 'Valencia',
    source: 'InfoJobs',
    availability: ['unavailable', 3, 45],
    cv: true,
  },
  {
    first: 'Martina',
    last: 'Ruiz Delgado',
    city: 'Sevilla',
    source: 'Referencia',
    availability: null,
    cv: false,
  },
  {
    first: 'Pablo',
    last: 'Navarro Cano',
    city: 'Madrid',
    source: 'LinkedIn',
    availability: ['available', 4],
    cv: true,
  },
  {
    first: 'Sofía',
    last: 'Romero Vidal',
    city: 'Bilbao',
    source: 'Web corporativa',
    availability: null,
    cv: true,
  },
  {
    first: 'Daniel',
    last: 'Torres Molina',
    city: 'Málaga',
    source: 'InfoJobs',
    availability: ['unavailable', 9],
    cv: false,
  },
  {
    first: 'Valeria',
    last: 'Domínguez Ríos',
    city: 'Madrid',
    source: 'LinkedIn',
    availability: ['available', 7],
    cv: false,
  },
  {
    first: 'Álvaro',
    last: 'Castillo Peña',
    city: 'Zaragoza',
    source: 'Referencia',
    availability: null,
    cv: true,
  },
  {
    first: 'Carmen',
    last: 'Iglesias Soto',
    city: 'Valencia',
    source: 'Feria de empleo',
    availability: ['available', 12],
    cv: true,
  },
  {
    first: 'Javier',
    last: 'Prieto Lozano',
    city: 'Madrid',
    source: 'LinkedIn',
    availability: null,
    cv: false,
  },
  {
    first: 'Elena',
    last: 'Garrido Fuentes',
    city: 'Barcelona',
    source: 'InfoJobs',
    availability: ['unavailable', 15, 20],
    cv: true,
  },
  {
    first: 'Mario',
    last: 'Herrera Campos',
    city: 'Sevilla',
    source: 'Web corporativa',
    availability: null,
    cv: false,
  },
  {
    first: 'Noa',
    last: 'Méndez Blanco',
    city: 'Madrid',
    source: 'LinkedIn',
    availability: ['available', 2],
    cv: true,
  },
  {
    first: 'Adrián',
    last: 'Rubio Herrero',
    city: 'A Coruña',
    source: 'Referencia',
    availability: null,
    cv: true,
  },
  {
    first: 'Paula',
    last: 'Moreno Pastor',
    city: 'Valencia',
    source: 'InfoJobs',
    availability: ['available', 18],
    cv: false,
  },
  {
    first: 'Diego',
    last: 'Santos Calvo',
    city: 'Madrid',
    source: 'LinkedIn',
    availability: null,
    cv: false,
  },
  {
    first: 'Irene',
    last: 'Medina Vega',
    city: 'Málaga',
    source: 'Feria de empleo',
    availability: ['unavailable', 21],
    cv: true,
  },
  {
    first: 'Sergio',
    last: 'Cortés Reyes',
    city: 'Bilbao',
    source: 'Web corporativa',
    availability: null,
    cv: false,
  },
  {
    first: 'Claudia',
    last: 'Aguilar Marín',
    city: 'Madrid',
    source: 'LinkedIn',
    availability: ['available', 26],
    cv: true,
  },
  {
    first: 'Raúl',
    last: 'Nieto Santana',
    city: 'Zaragoza',
    source: 'InfoJobs',
    availability: null,
    cv: false,
  },
  {
    first: 'Andrea',
    last: 'Vargas León',
    city: 'Sevilla',
    source: 'Referencia',
    availability: ['unavailable', 28, 60],
    cv: false,
  },
  {
    first: 'Iván',
    last: 'Ramos Benítez',
    city: 'Madrid',
    source: 'LinkedIn',
    availability: null,
    cv: true,
  },
  {
    first: 'Laura',
    last: 'Gómez Sanz',
    city: 'Valencia',
    source: 'InfoJobs',
    availability: ['available', 0],
    cv: false,
    removed: true,
  },
  {
    first: 'Óscar',
    last: 'Fernández Mora',
    city: 'Madrid',
    source: 'Web corporativa',
    availability: null,
    cv: true,
    removed: true,
  },
];

const NOTES = {
  Madrid: 'Disponible para trabajar en Madrid capital y alrededores.',
  default: 'Perfil recibido para la base de datos de demostración.',
};

/**
 * 8 positions, listed most recently updated first: they are created in reverse, so the first
 * here ends up on top of «Posiciones abiertas». `links` maps candidate indexes (into CANDIDATES)
 * to the stage they sit at.
 */
const POSITIONS = [
  {
    title: 'Desarrollador .NET sénior',
    location: 'Madrid',
    links: {
      0: 'interview',
      3: 'shortlisted',
      6: 'new',
      12: 'new',
      9: 'new',
      18: 'rejected',
      21: 'hired',
    },
  },
  {
    title: 'Técnico de soporte N2',
    location: 'Valencia',
    links: { 1: 'rejected', 8: 'interview', 14: 'shortlisted', 10: 'new' },
  },
  {
    title: 'Analista de datos',
    location: 'Remoto',
    links: { 4: 'new', 7: 'new', 13: 'shortlisted', 19: 'rejected', 16: 'interview' },
  },
  {
    title: 'Jefe de proyecto',
    location: 'Madrid',
    links: { 15: 'hired', 9: 'rejected', 2: 'interview' },
  },
  { title: 'Administrativo de RR. HH.', location: 'Sevilla', links: { 11: 'new', 20: 'new' } },
  { title: 'Diseñador UX/UI', location: 'Bilbao', links: {} },
  {
    title: 'Comercial B2B',
    location: 'Málaga',
    links: { 5: 'shortlisted', 17: 'new', 23: 'rejected' },
  },
  {
    title: 'Becario de marketing',
    location: 'Barcelona',
    closed: true,
    links: { 22: 'hired', 11: 'rejected' },
  },
];

/**
 * Languages, programs and skills per candidate index (into CANDIDATES), as catalog names from
 * the deployment seed (backend/Infrastructure/Persistence/CatalogSeedData.cs). Languages are
 * `[language, level]`, programs `[program, level, years]`, skills `[skill, level]`.
 *
 * Built for the «Inglés B2 + Navision + AutoCAD» search (preset of the same name). The language
 * level is a minimum, so it finds the six candidates marked MATCH and Sofía (index 4, Inglés C1).
 * The NEAR ones miss on exactly one criterion, so the filter visibly does something.
 */
const COMPETENCIES = {
  0: {
    // MATCH
    languages: [
      ['Inglés', 'B2'],
      ['Francés', 'A2'],
    ],
    programs: [
      ['Navision', 'Avanzado', 4],
      ['AutoCAD', 'Medio', 3],
      ['Excel', 'Avanzado', 6],
    ],
    skills: [
      ['Contabilidad', 'Alto'],
      ['Facturación', 'Medio'],
    ],
  },
  1: {
    languages: [['Inglés', 'C1']],
    programs: [
      ['Python', 'Avanzado', 5],
      ['SQL', 'Avanzado', 5],
      ['Git', 'Medio', 4],
    ],
    skills: [['Análisis', 'Alto']],
  },
  2: {
    languages: [['Inglés', 'B1']],
    programs: [
      ['Excel', 'Medio', 3],
      ['Word', 'Avanzado', 5],
    ],
    skills: [
      ['Gestión de proyectos', 'Alto'],
      ['Liderazgo de equipos', 'Medio'],
    ],
  },
  3: {
    // MATCH
    languages: [['Inglés', 'B2']],
    programs: [
      ['AutoCAD', 'Avanzado', 6],
      ['Navision', 'Medio', 2],
      ['SolidWorks', 'Medio', 3],
    ],
    skills: [
      ['Lectura de planos', 'Experto'],
      ['Control de calidad', 'Alto'],
    ],
  },
  4: {
    // Matches through the minimum level: C1 is above B2.
    languages: [
      ['Inglés', 'C1'],
      ['Alemán', 'B1'],
    ],
    programs: [
      ['Navision', 'Experto', 8],
      ['AutoCAD', 'Básico', 1],
      ['Power BI', 'Medio', 2],
    ],
    skills: [
      ['Compras', 'Alto'],
      ['Negociación', 'Alto'],
    ],
  },
  5: {
    languages: [['Inglés', 'A2']],
    programs: [['Excel', 'Básico', 1]],
    skills: [
      ['Atención al cliente', 'Alto'],
      ['Negociación', 'Medio'],
    ],
  },
  6: {
    languages: [['Inglés', 'C2']],
    programs: [
      ['JavaScript', 'Experto', 7],
      ['HTML', 'Avanzado', 7],
      ['CSS', 'Avanzado', 7],
    ],
    skills: [['Trabajo en equipo', 'Alto']],
  },
  7: {
    // NEAR: English below the minimum.
    languages: [['Inglés', 'B1']],
    programs: [
      ['Navision', 'Avanzado', 5],
      ['AutoCAD', 'Avanzado', 5],
    ],
    skills: [
      ['Mantenimiento preventivo', 'Alto'],
      ['Lectura de planos', 'Alto'],
    ],
  },
  8: {
    // MATCH
    languages: [
      ['Inglés', 'B2'],
      ['Italiano', 'B1'],
    ],
    programs: [
      ['Navision', 'Avanzado', 3],
      ['AutoCAD', 'Avanzado', 4],
      ['Excel', 'Experto', 9],
    ],
    skills: [
      ['Logística de almacén', 'Alto'],
      ['Gestión documental', 'Medio'],
    ],
  },
  9: {
    languages: [['Inglés', 'C1']],
    programs: [
      ['C#', 'Experto', 8],
      ['SQL', 'Avanzado', 8],
    ],
    skills: [['Liderazgo de equipos', 'Alto']],
  },
  10: {
    // NEAR: no Navision.
    languages: [['Inglés', 'B2']],
    programs: [
      ['AutoCAD', 'Experto', 10],
      ['Revit', 'Avanzado', 6],
    ],
    skills: [['Lectura de planos', 'Experto']],
  },
  11: {
    languages: [['Inglés', 'A2']],
    programs: [
      ['A3', 'Avanzado', 4],
      ['ContaPlus', 'Medio', 3],
    ],
    skills: [
      ['Nóminas', 'Alto'],
      ['Selección de personal', 'Medio'],
    ],
  },
  12: {
    // MATCH
    languages: [['Inglés', 'B2']],
    programs: [
      ['AutoCAD', 'Medio', 2],
      ['Navision', 'Medio', 2],
      ['Word', 'Avanzado', 4],
    ],
    skills: [['Atención al cliente', 'Alto']],
  },
  13: {
    // MATCH
    languages: [
      ['Inglés', 'B2'],
      ['Portugués', 'B1'],
    ],
    programs: [
      ['Navision', 'Avanzado', 6],
      ['AutoCAD', 'Avanzado', 5],
      ['EPLAN', 'Medio', 2],
    ],
    skills: [
      ['Montaje industrial', 'Alto'],
      ['Prevención de riesgos laborales', 'Medio'],
    ],
  },
  14: {
    languages: [['Francés', 'B2']],
    programs: [['Excel', 'Medio', 2]],
    skills: [['Atención al cliente', 'Experto']],
  },
  15: {
    // NEAR: no AutoCAD.
    languages: [['Inglés', 'B2']],
    programs: [
      ['Navision', 'Experto', 9],
      ['SAP', 'Avanzado', 5],
    ],
    skills: [
      ['Gestión de proyectos', 'Experto'],
      ['Contabilidad', 'Medio'],
    ],
  },
  16: {
    languages: [['Inglés', 'B1']],
    programs: [
      ['Power BI', 'Avanzado', 3],
      ['Tableau', 'Medio', 2],
    ],
    skills: [['Análisis', 'Experto']],
  },
  17: {
    // MATCH
    languages: [['Inglés', 'B2']],
    programs: [
      ['Navision', 'Medio', 3],
      ['AutoCAD', 'Medio', 3],
    ],
    skills: [
      ['Compras', 'Medio'],
      ['Negociación', 'Alto'],
    ],
  },
  18: {
    languages: [['Inglés', 'C1']],
    programs: [
      ['Photoshop', 'Experto', 6],
      ['Illustrator', 'Avanzado', 6],
    ],
    skills: [['Trabajo en equipo', 'Alto']],
  },
  19: {
    languages: [['Alemán', 'C1']],
    programs: [
      ['MATLAB', 'Avanzado', 4],
      ['Simulink', 'Medio', 3],
    ],
    skills: [['Análisis', 'Alto']],
  },
  20: {
    languages: [['Inglés', 'B1']],
    programs: [['Word', 'Medio', 3]],
    skills: [
      ['Selección de personal', 'Alto'],
      ['Gestión documental', 'Alto'],
    ],
  },
  21: {
    languages: [['Inglés', 'B2']],
    programs: [
      ['CATIA', 'Medio', 2],
      ['SolidWorks', 'Avanzado', 4],
    ],
    skills: [
      ['Soldadura', 'Experto'],
      ['Mecanizado', 'Alto'],
    ],
  },
};

/** The three PUT bodies' collections for one profile; new rows, so every `id` is null. */
function competencyBodies(profile) {
  return {
    languages: profile.languages.map(([language, level]) => ({ id: null, language, level })),
    programs: profile.programs.map(([program, level, yearsExperience]) => ({
      id: null,
      program,
      level,
      yearsExperience,
    })),
    skills: profile.skills.map(([skill, level]) => ({ id: null, skill, level })),
  };
}

/**
 * Education and work history per candidate index (into CANDIDATES), consistent with each one's
 * competencies. Type, status and sector are catalog names from the deployment seed. Education is
 * `[type, degree, specialty, institution, status, endYear]`; experience is
 * `[company, position, sector, startDate, endDate, functions]`, with `endDate` null for the
 * current job. Every company is invented.
 */
const BACKGROUND = {
  0: {
    education: [
      [
        'Grado',
        'Administración y Dirección de Empresas',
        'Finanzas',
        'Universidad Complutense de Madrid',
        'Finalizada',
        2016,
      ],
    ],
    experience: [
      [
        'Distribuciones Arganda S.L.',
        'Técnica contable',
        'Comercio',
        '2020-03-01',
        null,
        'Contabilidad general, facturación y cierres mensuales en Navision.',
      ],
      [
        'Gestoría Retiro Asesores',
        'Auxiliar contable',
        'Servicios',
        '2016-09-01',
        '2020-02-29',
        'Registro de facturas y conciliaciones bancarias.',
      ],
    ],
  },
  1: {
    education: [
      [
        'Grado',
        'Ingeniería Informática',
        'Computación',
        'Universitat Politècnica de València',
        'Finalizada',
        2018,
      ],
    ],
    experience: [
      [
        'Datos Turia Analytics S.L.',
        'Ingeniero de datos',
        'Tecnología',
        '2021-01-01',
        null,
        'Procesos ETL en Python y modelado de datos en SQL.',
      ],
      [
        'Levante Software Factory',
        'Desarrollador junior',
        'Tecnología',
        '2018-07-01',
        '2020-12-31',
        'Scripts de integración y mantenimiento de bases de datos.',
      ],
    ],
  },
  2: {
    education: [
      [
        'Grado',
        'Ingeniería de Organización Industrial',
        null,
        'Universidad de Sevilla',
        'Finalizada',
        2015,
      ],
      ['Máster', 'Dirección de Proyectos', null, 'Universidad de Sevilla', 'Finalizada', 2017],
    ],
    experience: [
      [
        'Consultora Guadalquivir Proyectos',
        'Coordinadora de proyectos',
        'Servicios',
        '2019-02-01',
        null,
        'Planificación, seguimiento de plazos y coordinación de equipos de hasta 8 personas.',
      ],
      [
        'Instalaciones Triana S.A.',
        'Técnica de planificación',
        'Construcción',
        '2016-06-01',
        '2019-01-31',
        'Elaboración de cronogramas y control de costes de obra.',
      ],
    ],
  },
  3: {
    education: [
      [
        'Ingeniería Técnica',
        'Ingeniería Técnica Industrial',
        'Mecánica',
        'Universidad Politécnica de Madrid',
        'Finalizada',
        2014,
      ],
    ],
    experience: [
      [
        'Calderería Henares S.L.',
        'Delineante proyectista',
        'Metal',
        '2018-04-01',
        null,
        'Planos de fabricación en AutoCAD y SolidWorks; revisión de calidad dimensional.',
      ],
      [
        'Montajes Industriales Getafe',
        'Delineante',
        'Industria',
        '2014-10-01',
        '2018-03-31',
        'Delineación de estructuras metálicas y listas de materiales.',
      ],
    ],
  },
  4: {
    education: [
      ['Grado', 'Comercio Internacional', null, 'Universidad de Deusto', 'Finalizada', 2012],
    ],
    experience: [
      [
        'Suministros Nervión S.A.',
        'Responsable de compras',
        'Industria',
        '2017-05-01',
        null,
        'Negociación con proveedores europeos y gestión de pedidos en Navision.',
      ],
      [
        'Exportaciones Abra S.L.',
        'Técnica de compras',
        'Comercio',
        '2012-09-01',
        '2017-04-30',
        'Homologación de proveedores y seguimiento de importaciones.',
      ],
    ],
  },
  5: {
    education: [
      [
        'FP Grado superior',
        'Gestión de Ventas y Espacios Comerciales',
        null,
        'IES Costa del Sol',
        'Finalizada',
        2017,
      ],
    ],
    experience: [
      [
        'Climatización Málaga Sur S.L.',
        'Comercial',
        'Comercio',
        '2019-03-01',
        null,
        'Visitas a clientes, presupuestos y seguimiento de cartera.',
      ],
      [
        'Hipermercado Guadalhorce',
        'Dependiente',
        'Comercio',
        '2017-06-01',
        '2019-02-28',
        'Atención al cliente y reposición.',
      ],
    ],
  },
  6: {
    education: [
      [
        'Grado',
        'Ingeniería del Software',
        null,
        'Universidad Politécnica de Madrid',
        'Finalizada',
        2017,
      ],
    ],
    experience: [
      [
        'Estudio Web Castellana S.L.',
        'Desarrolladora front-end sénior',
        'Tecnología',
        '2020-09-01',
        null,
        'Aplicaciones JavaScript accesibles y sistema de componentes.',
      ],
      [
        'Agencia Digital Chamberí',
        'Desarrolladora front-end',
        'Tecnología',
        '2017-07-01',
        '2020-08-31',
        'Maquetación HTML y CSS de sitios corporativos.',
      ],
    ],
  },
  7: {
    education: [
      [
        'FP Grado superior',
        'Mecatrónica Industrial',
        null,
        'CPIFP Los Enlaces',
        'Finalizada',
        2013,
      ],
    ],
    experience: [
      [
        'Componentes Ebro S.A.',
        'Técnico de mantenimiento',
        'Automoción',
        '2016-01-01',
        null,
        'Mantenimiento preventivo y correctivo de líneas de estampación.',
      ],
      [
        'Talleres Delicias S.L.',
        'Ayudante de mantenimiento',
        'Industria',
        '2013-07-01',
        '2015-12-31',
        'Reparaciones mecánicas e interpretación de planos.',
      ],
    ],
  },
  8: {
    education: [
      [
        'Grado',
        'Administración y Dirección de Empresas',
        null,
        'Universitat de València',
        'Finalizada',
        2010,
      ],
    ],
    experience: [
      [
        'Logística Puerto de Valencia S.L.',
        'Jefa de almacén',
        'Logística y transporte',
        '2015-02-01',
        null,
        'Gestión de stock en Navision, inventarios y equipo de 12 personas.',
      ],
      [
        'Transportes Albufera S.A.',
        'Administrativa de tráfico',
        'Logística y transporte',
        '2010-09-01',
        '2015-01-31',
        'Planificación de rutas y documentación de envíos.',
      ],
    ],
  },
  9: {
    education: [
      [
        'Grado',
        'Ingeniería Informática',
        null,
        'Universidad Carlos III de Madrid',
        'Finalizada',
        2012,
      ],
      [
        'Máster',
        'Ingeniería del Software',
        'Arquitectura de sistemas',
        'Universidad Carlos III de Madrid',
        'Finalizada',
        2014,
      ],
    ],
    experience: [
      [
        'Banca Sol Digital S.A.',
        'Líder técnico .NET',
        'Banca y seguros',
        '2019-01-01',
        null,
        'Arquitectura de servicios en C#, revisión de código y liderazgo de un equipo de 6.',
      ],
      [
        'Soluciones Atocha Software',
        'Desarrollador .NET',
        'Tecnología',
        '2014-03-01',
        '2018-12-31',
        'Desarrollo de aplicaciones de gestión sobre SQL Server.',
      ],
    ],
  },
  10: {
    education: [
      [
        'Grado',
        'Arquitectura Técnica',
        null,
        'Universitat Politècnica de Catalunya',
        'Finalizada',
        2011,
      ],
    ],
    experience: [
      [
        'Construcciones Llobregat S.A.',
        'Delineante BIM',
        'Construcción',
        '2016-04-01',
        null,
        'Modelado en Revit y planos de ejecución en AutoCAD.',
      ],
      [
        'Estudio Gràcia Arquitectes',
        'Delineante',
        'Construcción',
        '2011-09-01',
        '2016-03-31',
        'Planos de proyecto básico y de ejecución.',
      ],
    ],
  },
  11: {
    education: [
      ['FP Grado superior', 'Administración y Finanzas', null, 'IES Nervión', 'Finalizada', 2014],
    ],
    experience: [
      [
        'Servicios Integrales Aljarafe S.L.',
        'Administrativo de RR. HH.',
        'Servicios',
        '2017-01-01',
        null,
        'Nóminas y seguros sociales en A3; apoyo en procesos de selección.',
      ],
      [
        'Asesoría Macarena',
        'Auxiliar administrativo',
        'Servicios',
        '2014-07-01',
        '2016-12-31',
        'Contabilidad en ContaPlus y archivo.',
      ],
    ],
  },
  12: {
    education: [['Grado', 'Turismo', null, 'Universidad Rey Juan Carlos', 'Finalizada', 2019]],
    experience: [
      [
        'Hoteles Gran Vía S.A.',
        'Recepcionista',
        'Hostelería',
        '2021-05-01',
        null,
        'Atención a clientes, reservas y gestión de incidencias.',
      ],
      [
        'Viajes Lavapiés S.L.',
        'Agente de viajes',
        'Servicios',
        '2019-07-01',
        '2021-04-30',
        'Venta de paquetes y atención telefónica.',
      ],
    ],
  },
  13: {
    education: [
      [
        'FP Grado superior',
        'Automatización y Robótica Industrial',
        null,
        'CIFP Someso',
        'Finalizada',
        2015,
      ],
      [
        'Tarjeta del metal',
        'Tarjeta Profesional de la Construcción del Metal',
        null,
        'Fundación del Metal para la Formación',
        'Finalizada',
        2016,
      ],
    ],
    experience: [
      [
        'Montajes Eléctricos Atlántico S.L.',
        'Técnico de montaje industrial',
        'Metal',
        '2018-02-01',
        null,
        'Montaje de cuadros eléctricos con esquemas en EPLAN.',
      ],
      [
        'Astilleros Orzán S.A.',
        'Electricista naval',
        'Naval',
        '2015-09-01',
        '2018-01-31',
        'Cableado y conexionado a bordo.',
      ],
    ],
  },
  14: {
    education: [
      [
        'Grado',
        'Traducción e Interpretación',
        'Francés',
        'Universitat de València',
        'Finalizada',
        2020,
      ],
    ],
    experience: [
      [
        'Centro de Atención Malvarrosa S.L.',
        'Agente de atención al cliente',
        'Servicios',
        '2020-10-01',
        null,
        'Soporte telefónico y por correo en español y francés.',
      ],
    ],
  },
  15: {
    education: [
      [
        'Grado',
        'Ingeniería en Tecnologías Industriales',
        null,
        'Universidad Politécnica de Madrid',
        'Finalizada',
        2009,
      ],
      [
        'Máster',
        'Administración de Empresas (MBA)',
        null,
        'Universidad de Alcalá',
        'Finalizada',
        2013,
      ],
    ],
    experience: [
      [
        'Energías Meseta S.A.',
        'Jefe de proyecto',
        'Energía',
        '2016-06-01',
        null,
        'Dirección de proyectos de instalaciones, presupuestos y relación con cliente.',
      ],
      [
        'Ingeniería Moncloa S.L.',
        'Ingeniero de proyectos',
        'Industria',
        '2009-09-01',
        '2016-05-31',
        'Ingeniería de detalle y compras en SAP.',
      ],
    ],
  },
  16: {
    education: [['Grado', 'Estadística', null, 'Universidad de Málaga', 'Finalizada', 2020]],
    experience: [
      [
        'Marketing Analítico Sur S.L.',
        'Analista de datos',
        'Servicios',
        '2021-03-01',
        null,
        'Cuadros de mando en Power BI y Tableau; análisis de campañas.',
      ],
    ],
  },
  17: {
    education: [['Grado', 'Economía', null, 'Universidad del País Vasco', 'Finalizada', 2016]],
    experience: [
      [
        'Recambios Bizkaia S.L.',
        'Comercial B2B',
        'Automoción',
        '2019-09-01',
        null,
        'Venta a talleres y distribuidores; negociación de condiciones anuales.',
      ],
      [
        'Ferretería Industrial Deusto',
        'Técnico de compras',
        'Comercio',
        '2016-07-01',
        '2019-08-31',
        'Pedidos a proveedores y control de stock.',
      ],
    ],
  },
  18: {
    education: [
      [
        'Grado',
        'Diseño',
        'Diseño gráfico',
        'Universidad Complutense de Madrid',
        'Finalizada',
        2016,
      ],
    ],
    experience: [
      [
        'Estudio Creativo Malasaña S.L.',
        'Diseñadora gráfica',
        'Servicios',
        '2018-01-01',
        null,
        'Identidad de marca y piezas impresas y digitales en Photoshop e Illustrator.',
      ],
      [
        'Imprenta Lavapiés',
        'Maquetadora',
        'Industria',
        '2016-06-01',
        '2017-12-31',
        'Preparación de artes finales.',
      ],
    ],
  },
  19: {
    education: [
      ['Grado', 'Ingeniería Aeroespacial', null, 'Universidad de Zaragoza', 'Finalizada', 2021],
      ['Máster', 'Ingeniería Aeronáutica', null, 'Universidad de Zaragoza', 'En curso', null],
    ],
    experience: [
      [
        'Simulaciones Aeronáuticas Aragón S.L.',
        'Ingeniero de simulación (prácticas)',
        'Aeronáutica',
        '2024-09-01',
        null,
        'Modelos de control de vuelo en MATLAB y Simulink.',
      ],
    ],
  },
  20: {
    education: [
      [
        'Grado',
        'Relaciones Laborales y Recursos Humanos',
        null,
        'Universidad Pablo de Olavide',
        'Finalizada',
        2013,
      ],
    ],
    experience: [
      [
        'Selección Giralda S.L.',
        'Técnica de selección',
        'Servicios',
        '2016-03-01',
        null,
        'Procesos de selección completos y gestión documental de expedientes.',
      ],
      [
        'Empleo Temporal Sur S.A.',
        'Administrativa de personal',
        'Servicios',
        '2013-09-01',
        '2016-02-29',
        'Contratos, altas y archivo.',
      ],
    ],
  },
  21: {
    education: [
      ['FP Grado medio', 'Soldadura y Calderería', null, 'IES Pirámide', 'Finalizada', 2012],
      [
        'Soldadura TIG',
        'Certificado de soldador TIG',
        null,
        'Centro de Formación del Metal de Aragón',
        'Finalizada',
        2014,
      ],
    ],
    experience: [
      [
        'Estructuras Metálicas Cinco Villas S.L.',
        'Soldador oficial de primera',
        'Metal',
        '2015-05-01',
        null,
        'Soldadura TIG y MIG/MAG de estructuras; mecanizado de piezas.',
      ],
      [
        'Talleres Moncayo',
        'Soldador',
        'Metal',
        '2012-07-01',
        '2015-04-30',
        'Soldadura con electrodo y montaje en taller.',
      ],
    ],
  },
};

/**
 * Years between two `yyyy-MM-dd` dates, the current job running to `today`: the months from the
 * start month to the end month, both included, / 12 to one decimal. It is the formula the API
 * applies anyway (KTL-46), so a seeded value reads back as sent.
 */
function yearsBetween(start, end) {
  const month = (value) => Number(value.slice(0, 4)) * 12 + Number(value.slice(5, 7));
  return Math.round(((month(end) - month(start) + 1) / 12) * 10) / 10;
}

/** The two PUT bodies' collections for one background; new rows, so every `id` is null. */
function backgroundBodies(background, today) {
  return {
    education: background.education.map(
      ([educationType, degree, specialty, institution, status, endYear]) => ({
        id: null,
        educationType,
        degree,
        specialty,
        institution,
        status,
        endYear,
        notes: null,
      }),
    ),
    experience: background.experience.map(
      ([company, position, sector, startDate, endDate, functions]) => ({
        id: null,
        company,
        position,
        sector,
        functions,
        startDate,
        endDate,
        yearsExperience: yearsBetween(startDate, endDate ?? dayOffset(today, 0)),
        isCurrent: endDate === null,
        notes: null,
      }),
    ),
  };
}

const DESCRIPTION = (title) =>
  `<p>Posición de demostración: <strong>${title}</strong>. Datos ficticios creados para enseñar la página de inicio.</p>`;

/**
 * 4 shared presets. `used` gives the order in which they are applied after creation (1 first),
 * so the last one used is the most recent; `null` is never used.
 */
const PRESETS = [
  {
    name: 'Disponibles con CV',
    used: 3,
    filters: { availabilityValues: ['available'], hasCv: 'yes' },
  },
  { name: 'Pendientes de comprobar', used: 1, filters: { availabilityValues: ['unknown'] } },
  { name: 'Candidatos en Madrid', used: 2, filters: { text: 'Madrid' } },
  {
    name: 'No disponibles con CV',
    used: null,
    filters: { availabilityValues: ['unavailable'], hasCv: 'yes' },
  },
  {
    name: 'Inglés B2 + Navision + AutoCAD',
    used: 4,
    filters: {
      languageCriteria: [{ value: 'Inglés', level: 'B2' }],
      languageMode: 'ALL',
      programCriteria: [
        { value: 'Navision', level: '' },
        { value: 'AutoCAD', level: '' },
      ],
      programMode: 'ALL',
    },
  },
];

const STAGES = ['new', 'shortlisted', 'interview', 'hired', 'rejected'];

/** Lower-case ASCII local part, e.g. «Lucía Martín Ortega» → «lucia.martin». */
function emailFor(candidate) {
  const plain = (value) =>
    value
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z]/g, '');
  return `${plain(candidate.first)}.${plain(candidate.last.split(' ')[0])}@${DEMO_DOMAIN}`;
}

/** A Spanish mobile number derived from the index: 9 digits, never the e2e 13-digit marker. */
function phoneFor(index) {
  return `+34 6${String(10 + index).padStart(2, '0')} ${String(100 + index * 7).padStart(3, '0')} ${String(200 + index * 13).padStart(3, '0')}`;
}

/** `yyyy-MM-dd` of `today` moved by `days`, in UTC, as the API's wire dates expect. */
function dayOffset(today, days) {
  const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

/** The create body for one candidate. */
function candidateBody(candidate, index, today) {
  return {
    firstName: candidate.first,
    lastName: candidate.last,
    phone: phoneFor(index),
    email: emailFor(candidate),
    location: candidate.city,
    province: candidate.city,
    country: 'España',
    source: candidate.source,
    notes: NOTES[candidate.city] ?? NOTES.default,
    receivedAt: dayOffset(today, -40 - index),
    consentAt: dayOffset(today, -40 - index),
    reviewDueAt: dayOffset(today, 690 - index),
  };
}

/** The availability body for one candidate, or null when it stays unchecked. */
function availabilityBody(candidate, today) {
  if (!candidate.availability) return null;
  const [state, daysAgo, untilDays] = candidate.availability;
  return {
    state,
    checkedOn: dayOffset(today, -daysAgo),
    until: untilDays ? dayOffset(today, untilDays) : null,
  };
}

/**
 * Refuses any target but this machine. The dev token endpoint is never mapped in Production; this
 * is the second guard, so a mistyped URL cannot point fabricated data at a shared server.
 */
function assertLoopback(baseUrl) {
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error(`'${baseUrl}' is not a URL.`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`'${baseUrl}' must be an http(s) URL.`);
  }
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error(
      `Refusing '${url.hostname}': demo data is written only to a stack on this machine (localhost, 127.0.0.1 or ::1).`,
    );
  }
  return url;
}

module.exports = {
  BACKGROUND,
  CANDIDATES,
  COMPETENCIES,
  DEMO_DOMAIN,
  DESCRIPTION,
  POSITIONS,
  PRESETS,
  STAGES,
  assertLoopback,
  availabilityBody,
  backgroundBodies,
  candidateBody,
  competencyBodies,
  dayOffset,
  emailFor,
  phoneFor,
};
