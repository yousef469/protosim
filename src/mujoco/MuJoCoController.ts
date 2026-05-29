import loadMujoco from '@mujoco/mujoco';
import type { MjModel, MjData } from '@mujoco/mujoco';
import mujocoWasmUrl from '@mujoco/mujoco/mujoco.wasm?url';

type ModuleType = Awaited<ReturnType<typeof loadMujoco>>;

const meshExts = /\.(stl|obj|msh|dae|ply)$/i;

export interface MuJoCoState {
  qpos: Float64Array;
  qvel: Float64Array;
  ctrl: Float64Array;
  xpos: Float64Array;
  xquat: Float64Array;
  geom_xpos: Float64Array;
  geom_xmat: Float64Array;
  time: number;
}

export class MuJoCoController {
  private module: ModuleType | null = null;
  private _model: MjModel | null = null;
  private _data: MjData | null = null;
  private loaded = false;
  private initPromise: Promise<void> | null = null;

  get isLoaded() { return this.loaded; }
  get modelNq() { return this._model?.nq ?? 0; }
  get modelNv() { return this._model?.nv ?? 0; }
  get modelNu() { return this._model?.nu ?? 0; }
  get modelNbody() { return this._model?.nbody ?? 0; }
  get modelNgeom() { return this._model?.ngeom ?? 0; }

  async init(): Promise<void> {
    if (this.module) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = (async () => {
      const mod = await loadMujoco({
        noInitialRun: true,
        locateFile: (path: string) => {
          if (path.endsWith('.wasm')) return mujocoWasmUrl;
          return path;
        },
      }) as unknown as ModuleType;
      this.module = mod;
    })();
    await this.initPromise;
  }

  async loadXML(
    xmlContent: string,
    meshFiles?: Map<string, Uint8Array>,
    allXmls?: Map<string, string>,
  ): Promise<boolean> {
    if (!this.module) await this.init();
    if (!this.module) return false;
    const mod = this.module;

    try {
      const base = '/model';

      // Clean previous FS state
      const wipeDir = (path: string) => {
        for (const entry of mod.FS.readdir(path)) {
          if (entry === '.' || entry === '..') continue;
          const full = path + '/' + entry;
          try { wipeDir(full); mod.FS.rmdir(full); } catch { mod.FS.unlink(full); }
        }
      };
      try { wipeDir(base); mod.FS.rmdir(base); } catch {}

      mod.FS.mkdir(base);

      const ensureDir = (dirPath: string) => {
        const parts = dirPath.replace(/^\//, '').split('/').filter(Boolean);
        let cur = '';
        for (const p of parts) {
          cur += '/' + p;
          try { mod.FS.mkdir(cur); } catch {}
        }
      };

      const xmlPath = base + '/scene.xml';
      mod.FS.writeFile(xmlPath, new TextEncoder().encode(xmlContent));

      // Write XMLs that are transitively <include>d by the root
      const needed: Map<string, string> = allXmls ? collectAllIncludes(xmlContent, allXmls) : new Map();
      if (needed.size > 0) {
        console.log('[MuJoCo] writing', needed.size, 'included XMLs:', [...needed.keys()]);
        for (const [filename, text] of needed) {
          mod.FS.writeFile(base + '/' + filename, new TextEncoder().encode(text));
        }
      }

      // Write mesh files
      if (meshFiles && meshFiles.size > 0) {
        const allXmlText = [xmlContent, ...(allXmls ? [...allXmls.values()] : [])].join('\n');

        // Collect mesh file paths from file="..." attributes
        const referencedPaths = new Set<string>();
        const fileAttrRe = /file\s*=\s*["']([^"']+)["']/gi;
        let m;
        while ((m = fileAttrRe.exec(allXmlText)) !== null) {
          const p = m[1].trim();
          if (meshExts.test(p)) referencedPaths.add(p);
        }

        // Extract meshdir from compiler tags across all XMLs
        const meshdirs = new Set<string>();
        const meshdirRe = /meshdir\s*=\s*["']([^"']+)["']/gi;
        let dm;
        while ((dm = meshdirRe.exec(allXmlText)) !== null) {
          meshdirs.add(dm[1].replace(/^\.\//, '').replace(/\/$/, ''));
        }

        const byLeaf = new Map<string, Uint8Array>();
        for (const [name, data] of meshFiles) {
          byLeaf.set(name, data);
          byLeaf.set(name.toLowerCase(), data);
          const leaf = name.replace(/^.*[/\\]/, '');
          byLeaf.set(leaf, data);
          byLeaf.set(leaf.toLowerCase(), data);
        }

        for (const refPath of referencedPaths) {
          const leaf = refPath.replace(/^.*[/\\]/, '');
          const data = byLeaf.get(leaf) ?? byLeaf.get(leaf.toLowerCase()) ?? byLeaf.get(refPath) ?? byLeaf.get(refPath.toLowerCase());
          if (!data) {
            console.warn('[MuJoCo] no mesh data for:', refPath);
            continue;
          }

          // MuJoCo constructs: modelfiledir + meshdir + filename
          // modelfiledir = /model, meshdir = (from compiler tag), filename = refPath
          const exactPath = base + '/' + refPath;
          ensureDir(exactPath.substring(0, exactPath.lastIndexOf('/')));
          mod.FS.writeFile(exactPath, data);

          // Also write with every meshdir prefix (MuJoCo uses modelfiledir + meshdir + leaf)
          for (const md of meshdirs) {
            const mdPath = base + '/' + md + '/' + leaf;
            ensureDir(base + '/' + md);
            mod.FS.writeFile(mdPath, data);
          }
        }

        console.log('[MuJoCo] wrote', referencedPaths.size, 'mesh file paths');
      }

      // Rename duplicate geom names in root XML (root takes precedence over includes)
      if (allXmls && needed.size > 0) {
        const includedGeomNames = new Set<string>();
        const geomNameRe = /<geom\s[^>]*\bname\s*=\s*["']([^"']+)["']/gi;
        for (const [, text] of allXmls) {
          if (text === xmlContent) continue;
          let m2;
          while ((m2 = geomNameRe.exec(text)) !== null) includedGeomNames.add(m2[1]);
        }
        if (includedGeomNames.size > 0) {
          let rootXml = xmlContent;
          const rootGeoms: { full: string; name: string }[] = [];
          let m2;
          const rootRe = /<geom\s([^>]*\bname\s*=\s*["']([^"']+)["'][^>]*)>/gi;
          while ((m2 = rootRe.exec(xmlContent)) !== null) {
            rootGeoms.push({ full: m2[0], name: m2[2] });
          }
          let modified = false;
          for (const g of rootGeoms) {
            if (includedGeomNames.has(g.name)) {
              const newName = g.name + '_scene';
              rootXml = rootXml.replace(g.full, g.full.replace(`name="${g.name}"`, `name="${newName}"`));
              modified = true;
            }
          }
          if (modified) {
            mod.FS.writeFile(xmlPath, new TextEncoder().encode(rootXml));
            console.log('[MuJoCo] renamed conflicting root geoms');
          }
        }
      }

      const model = mod.MjModel.from_xml_path(xmlPath) as MjModel;
      const data = new mod.MjData(model) as MjData;

      if (this._data) (this._data as any).delete();
      if (this._model) (this._model as any).delete();

      this._model = model;
      this._data = data;
      this.loaded = true;

      mod.mj_forward(model, data);
      console.log('[MuJoCo] model loaded successfully');
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[MuJoCo] loadXML error:', msg);
      throw new Error(`MuJoCo parse error: ${msg}`);
    }
  }

  step(): void {
    if (!this._model || !this._data || !this.module) return;
    this.module.mj_step(this._model, this._data);
  }

  setCtrl(index: number, value: number): void {
    if (!this._data) return;
    const arr = this._data.ctrl as Float64Array;
    if (index < arr.length) arr[index] = value;
  }

  setAllCtrl(values: Float64Array | Float32Array | number[]): void {
    if (!this._data) return;
    const arr = this._data.ctrl as Float64Array;
    const len = Math.min(values.length, arr.length);
    for (let i = 0; i < len; i++) arr[i] = values[i];
  }

  getState(): MuJoCoState | null {
    if (!this._data || !this._model) return null;
    return {
      qpos: this._data.qpos as Float64Array,
      qvel: this._data.qvel as Float64Array,
      ctrl: this._data.ctrl as Float64Array,
      xpos: this._data.xpos as Float64Array,
      xquat: this._data.xquat as Float64Array,
      geom_xpos: this._data.geom_xpos as Float64Array,
      geom_xmat: this._data.geom_xmat as Float64Array,
      time: this._data.time as number,
    };
  }

  reset(): void {
    if (!this._model || !this._data || !this.module) return;
    this.module.mj_resetData(this._model, this._data);
    this.module.mj_forward(this._model, this._data);
  }

  getBodyName(id: number): string {
    if (!this._model || !this.module) return '';
    return this.module.mj_id2name(this._model, 1, id) as string;
  }

  getJointName(id: number): string {
    if (!this._model || !this.module) return '';
    return this.module.mj_id2name(this._model, 3, id) as string;
  }

  getActuatorName(id: number): string {
    if (!this._model || !this.module) return '';
    return this.module.mj_id2name(this._model, 7, id) as string;
  }

  dispose(): void {
    if (this.module) {
      if (this._data) (this._data as any).delete();
      if (this._model) (this._model as any).delete();
    }
    this._model = null;
    this._data = null;
    this.loaded = false;
    this.module = null;
    this.initPromise = null;
  }
}

function getIncludedFiles(xmlText: string): string[] {
  const includes: string[] = [];
  const re = /<include\s+file\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(xmlText)) !== null) {
    includes.push(m[1].trim());
  }
  return includes;
}

function collectAllIncludes(
  rootText: string,
  allXmls: Map<string, string>,
): Map<string, string> {
  const needed = new Map<string, string>();
  const queue = getIncludedFiles(rootText);
  while (queue.length > 0) {
    const filename = queue.shift()!;
    if (needed.has(filename)) continue;

    let text = allXmls.get(filename)
      ?? allXmls.get(filename.toLowerCase())
      ?? [...allXmls.entries()].find(([k]) =>
        k.replace(/^.*[/\\]/, '').toLowerCase() === filename.replace(/^.*[/\\]/, '').toLowerCase()
      )?.[1];
    if (!text) {
      console.warn('[MuJoCo] included file "' + filename + '" not found in uploads');
      continue;
    }
    needed.set(filename, text);
    queue.push(...getIncludedFiles(text));
  }
  return needed;
}

let mujocoInstance: MuJoCoController | null = null;

export function getMuJoCoController(): MuJoCoController {
  if (!mujocoInstance) {
    mujocoInstance = new MuJoCoController();
  }
  return mujocoInstance;
}
