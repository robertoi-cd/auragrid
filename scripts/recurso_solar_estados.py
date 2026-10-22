"""
Genera src/lib/recursoSolarEstados.ts: GHI y producción específica (PVOUT) promedio de las 32 entidades federativas.

Fuente: Global Solar Atlas (Banco Mundial / Solargis), API pública https://api.globalsolaratlas.info/data/lta?loc=lat,lon
Método: por cada estado se toma una cuadrícula regular de puntos dentro de sus límites (Natural Earth 1:10m admin-1,
dominio público), se ajusta el paso hasta tener al menos 9 puntos, se usan como máximo 16 repartidos en la
cuadrícula y se promedian GHI (kWh/m²/año → kWh/m²/día) y PVOUT (kWh/kWp·año, estructura fija con inclinación óptima).
Un estado con menos de 5 puntos válidos queda "por confirmar" (null).

Uso (desde la raíz del proyecto; consulta ~450 puntos con pausas, tarda ~20 min):
    python -I scripts/recurso_solar_estados.py <carpeta de trabajo vacía>
La carpeta de trabajo guarda la descarga de Natural Earth y una caché de las consultas (se puede reanudar).
"""
import json, os, statistics, sys, time, urllib.request

NATURAL_EARTH = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_admin_1_states_provinces.geojson'
GSA = 'https://api.globalsolaratlas.info/data/lta?loc={lat},{lon}'
NOMBRES = {
    'AGU': 'Aguascalientes', 'BCN': 'Baja California', 'BCS': 'Baja California Sur', 'CAM': 'Campeche', 'CHP': 'Chiapas',
    'CHH': 'Chihuahua', 'DIF': 'Ciudad de México', 'COA': 'Coahuila', 'COL': 'Colima', 'DUR': 'Durango', 'MEX': 'Estado de México',
    'GUA': 'Guanajuato', 'GRO': 'Guerrero', 'HID': 'Hidalgo', 'JAL': 'Jalisco', 'MIC': 'Michoacán', 'MOR': 'Morelos', 'NAY': 'Nayarit',
    'NLE': 'Nuevo León', 'OAX': 'Oaxaca', 'PUE': 'Puebla', 'QUE': 'Querétaro', 'ROO': 'Quintana Roo', 'SLP': 'San Luis Potosí',
    'SIN': 'Sinaloa', 'SON': 'Sonora', 'TAB': 'Tabasco', 'TAM': 'Tamaulipas', 'TLA': 'Tlaxcala', 'VER': 'Veracruz', 'YUC': 'Yucatán',
    'ZAC': 'Zacatecas',
}
MIN_PUNTOS, MAX_PUNTOS, MIN_VALIDOS = 9, 16, 5
SALIDA = os.path.join('src', 'lib', 'recursoSolarEstados.ts')


def en_anillo(x, y, anillo):
    dentro, j = False, len(anillo) - 1
    for i in range(len(anillo)):
        xi, yi = anillo[i]
        xj, yj = anillo[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi + 1e-15) + xi:
            dentro = not dentro
        j = i
    return dentro


def en_estado(x, y, poligonos):
    return any(en_anillo(x, y, pol[0]) and not any(en_anillo(x, y, h) for h in pol[1:]) for pol in poligonos)


def muestras(geojson):
    estados = []
    for f in json.load(open(geojson, encoding='utf-8'))['features']:
        p = f['properties']
        clave = (p.get('iso_3166_2') or '')[3:]
        if p.get('adm0_a3') != 'MEX' or clave not in NOMBRES:
            continue
        g = f['geometry']
        pols = [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']
        xs = [c[0] for pol in pols for c in pol[0]]
        ys = [c[1] for pol in pols for c in pol[0]]
        paso = 1.0
        while True:
            pts = []
            y = min(ys) + paso / 2
            while y < max(ys):
                x = min(xs) + paso / 2
                while x < max(xs):
                    if en_estado(x, y, pols):
                        pts.append((round(y, 4), round(x, 4)))
                    x += paso
                y += paso
            if len(pts) >= MIN_PUNTOS or paso < 0.02:
                break
            paso /= 2
        if len(pts) > MAX_PUNTOS:
            pts = [pts[round(i * (len(pts) - 1) / (MAX_PUNTOS - 1))] for i in range(MAX_PUNTOS)]
        estados.append({'nombre': NOMBRES[clave], 'puntos': pts})
    assert len(estados) == 32, len(estados)
    sin_acentos = str.maketrans('áéíóú', 'aeiou')
    return sorted(estados, key=lambda e: e['nombre'].translate(sin_acentos))


def consultar(estados, cache_ruta):
    cache = json.load(open(cache_ruta, encoding='utf-8')) if os.path.exists(cache_ruta) else {}
    for e in estados:
        for lat, lon in e['puntos']:
            clave = f'{lat},{lon}'
            if clave in cache and 'error' not in cache[clave]:
                continue
            for intento in range(4):
                try:
                    with urllib.request.urlopen(GSA.format(lat=lat, lon=lon), timeout=30) as r:
                        d = json.load(r)['annual']
                    cache[clave] = {'GHI': d['data'].get('GHI'), 'PVOUT_csi': d['data'].get('PVOUT_csi'),
                                    'version': d['metadata']['version']['data'], 'actualizado': d['metadata']['layers']['GHI']['updated']}
                    break
                except Exception as ex:
                    cache[clave] = {'error': str(ex)}
                    time.sleep(3 * (intento + 1))
            json.dump(cache, open(cache_ruta, 'w', encoding='utf-8'))
            time.sleep(0.4)
    return cache


def generar(estados, cache):
    filas, versiones = [], set()
    for e in estados:
        ok = [v for v in (cache.get(f'{a},{b}') for a, b in e['puntos']) if v and v.get('GHI') and v.get('PVOUT_csi')]
        versiones.update((v['version'], v['actualizado']) for v in ok)
        if len(ok) >= MIN_VALIDOS:
            ghi = [v['GHI'] / 365 for v in ok]
            filas.append((e['nombre'], round(statistics.mean(ghi), 2), round(min(ghi), 2), round(max(ghi), 2),
                          round(statistics.mean(v['PVOUT_csi'] for v in ok)), len(ok)))
        else:
            filas.append((e['nombre'], None, None, None, None, len(ok)))
    assert len(versiones) == 1, versiones
    version, actualizado = versiones.pop()
    n = lambda v: 'null' if v is None else repr(v)
    lineas = [
        '// GENERADO por scripts/recurso_solar_estados.py — no editar a mano (volver a ejecutar el script).',
        '// GHI y producción específica (PVOUT, estructura fija con inclinación óptima) promedio por entidad federativa.',
        f'// Fuente: Global Solar Atlas (Banco Mundial / Solargis), API pública /data/lta, datos v{version}, actualizados {actualizado}.',
        f'// Método: promedio simple de {MIN_PUNTOS} a {MAX_PUNTOS} puntos de una cuadrícula regular dentro de los límites estatales de',
        '// Natural Earth 1:10m (admin-1, v5.1.2). Es una aproximación ilustrativa, no un estudio de recurso del sitio.',
        '',
        'export interface RecursoSolarEstado {',
        '  /** GHI promedio, kWh/m²/día (null = por confirmar). */',
        '  ghi: number | null;',
        '  /** Rango de GHI entre los puntos muestreados, kWh/m²/día. */',
        '  ghiMin: number | null;',
        '  ghiMax: number | null;',
        '  /** Producción específica con estructura fija (PVOUT de Global Solar Atlas), kWh/kWp·año (null = por confirmar). */',
        '  pvout: number | null;',
        '  /** Puntos con dato usados en el promedio. */',
        '  puntos: number;',
        '}',
        '',
        f"export const FUENTE_RECURSO_SOLAR = 'Global Solar Atlas (Banco Mundial / Solargis), datos v{version} actualizados {actualizado}: "
        f"promedio de {MIN_PUNTOS} a {MAX_PUNTOS} puntos de una cuadrícula dentro de cada estado (límites: Natural Earth 1:10m)';",
        '',
        '/** Las 32 entidades federativas, en orden alfabético. */',
        'export const RECURSO_SOLAR_ESTADOS: Record<string, RecursoSolarEstado> = {',
        *[f"  '{nombre}': {{ ghi: {n(g)}, ghiMin: {n(gmin)}, ghiMax: {n(gmax)}, pvout: {n(pv)}, puntos: {k} }},"
          for nombre, g, gmin, gmax, pv, k in filas],
        '};',
    ]
    open(SALIDA, 'w', encoding='utf-8', newline='\n').write('\n'.join(lineas) + '\n')
    return filas


if __name__ == '__main__':
    trabajo = sys.argv[1]
    os.makedirs(trabajo, exist_ok=True)
    geojson = os.path.join(trabajo, 'admin1.geojson')
    if not os.path.exists(geojson):
        urllib.request.urlretrieve(NATURAL_EARTH, geojson)
    estados = muestras(geojson)
    filas = generar(estados, consultar(estados, os.path.join(trabajo, 'gsa_puntos.json')))
    print(f'{SALIDA}: {len(filas)} entidades; por confirmar: {[f[0] for f in filas if f[1] is None]}')
