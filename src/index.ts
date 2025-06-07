import type { Plugin as RollupPlugin } from 'rollup';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { normalizePath } from './utils';

const PINO_DIR = './pino';
const TRANSPORTS_DIR = `transports`;
type PinoCache = Record<string, { source: string; sourceMap?: string }>;

export interface PinoPluginOptions {
    transports?: string[];
    /** Set custom directory for pino files
     * @default pino
     */
    pinoDir?: string;
    /**
     * Set custom directory for all transports
     *  @default `${pinoDir}/transports`
     */
    transportsDir?: string;
}

export function RollupPinoPlugin(options: PinoPluginOptions = {}): RollupPlugin {
    const transports = options.transports || [];
    let pinoDir = options.pinoDir ?? PINO_DIR;

    const transportsDir =
        options.transportsDir !== undefined
            ? normalizePath(options.transportsDir)
            : `${pinoDir}/${TRANSPORTS_DIR}`;

    let outDir: string = './';

    // for 'pino' only (adding __bundlerPathsOverrides)
    const PINO_EXTERNAL = '\0pino-ext';
    // for other pino modules
    const PINO_EXTERNAL_PREFIX = '\0pino-ext-prefix';

    const PINO_EXTERNAL_PROXY_PREFIX = '\0pino-ext-proxy-prefix';
    const PINO_EXTERNAL_IMPORTER_PREFIX = '\0pino-ext-importer-prefix';

    let pinoFile = `${pinoDir}/pino.js`;
    let pinoCache: PinoCache | undefined = undefined;
    const overrides: Record<string, string> = {
        'pino/file': `${transportsDir}/pino-file.js`,
        'pino-worker': `${transportsDir}/pino-worker.js`,
        'thread-stream-worker': `${transportsDir}/thread-stream-worker.js`,
    };

    const plugin: RollupPlugin = {
        name: 'rollup-plugin-pino-bundle',
        // @ts-ignore vite
        apply: 'build',
        outputOptions(options) {
            if (options.dir) {
                outDir = options.dir;
            }
        },

        // todo: vite dev  server support
        // // vite
        // configResolved(config) {
        //     outDir = config.build.outDir;
        //     isVite = true;
        // },

        async buildStart() {
            if (pinoCache) {
                await Promise.all(
                    Object.entries(pinoCache).map(async ([filePath, { source, sourceMap }]) => {
                        const absolutePath = path.resolve(filePath);
                        await mkdir(path.dirname(absolutePath), { recursive: true });
                        await writeFile(absolutePath, source);
                        if (sourceMap) {
                            await writeFile(`${absolutePath}.map`, sourceMap);
                        }
                    })
                );
                return;
            }

            // build pino
            this.emitFile({
                type: 'chunk',
                id: PINO_EXTERNAL,
                fileName: normalizePath(path.join(pinoDir, 'pino.js')),
            });

            // build pino workers
            this.emitFile({
                type: 'chunk',
                id: 'pino/file.js',
                fileName: normalizePath(overrides['pino/file']),
            });
            this.emitFile({
                type: 'chunk',
                id: 'pino/lib/worker.js',
                fileName: normalizePath(overrides['pino-worker']),
            });
            this.emitFile({
                type: 'chunk',
                id: 'thread-stream/lib/worker.js',
                fileName: normalizePath(overrides['thread-stream-worker']),
            });

            // build custom  transports
            transports.map(async (transport) => {
                const resolution = await this.resolve(transport);
                if (!resolution) {
                    throw new Error(`Pino transport "${transport}" not  resolved!`);
                }
                overrides[transport] = `${transportsDir}/${transport}.js`;
                this.info(`Added transport ${transport} => ${normalizePath(overrides[transport])}`);
                this.emitFile({
                    type: 'chunk',
                    id: PINO_EXTERNAL_PREFIX + transport,
                    fileName: normalizePath(overrides[transport]),
                });
            });
        },

        resolveId: {
            order: 'pre',
            async handler(source, importer, options) {
                if (source === pinoFile) {
                    return { id: source, external: true };
                }
                if (source.startsWith(PINO_EXTERNAL_PROXY_PREFIX)) {
                    return { id: source, external: true };
                }
                if (source === 'pino') {
                    return { id: PINO_EXTERNAL_IMPORTER_PREFIX + pinoFile };
                }

                if (source == PINO_EXTERNAL) {
                    return { id: PINO_EXTERNAL, moduleSideEffects: true };
                }

                if (source.startsWith(PINO_EXTERNAL_PREFIX)) {
                    return { id: source, moduleSideEffects: true };
                }

                if (transports.includes(source)) {
                    return { id: PINO_EXTERNAL_IMPORTER_PREFIX + overrides[source] };
                }

                if (Object.values(overrides).includes(source)) {
                    return { id: source, external: true };
                }
            },
        },

        async load(id) {
            if (id === PINO_EXTERNAL) {
                const resolution = await this.resolve('pino');

                if (!resolution || resolution.external) return '';
                const absoluteOverrides = `{
                    ${Object.entries(overrides).map(([name, outPath]) => {
                        const relative = normalizePath(path.relative(pinoDir, outPath));

                        return `[${JSON.stringify(name)}]: path.join(dirname, ${JSON.stringify(
                            relative
                        )})`;
                    })}
                }`;

                return `
                import path from 'path';
                if(!globalThis.__bundlerPathsOverrides) globalThis.__bundlerPathsOverrides = {};
                const  dirname = typeof __dirname !== 'undefined' ? __dirname : import.meta.dirname;
                const bundlerPathsOverrides = ${absoluteOverrides};
                
                globalThis.__bundlerPathsOverrides =  {
                ...bundlerPathsOverrides,
                ...globalThis.__bundlerPathsOverrides,
                };

                export * from ${JSON.stringify(resolution.id)};
                export { default } from ${JSON.stringify(resolution.id)}
                `;
            }

            if (id.startsWith(PINO_EXTERNAL_PREFIX)) {
                const moduleId = id.slice(PINO_EXTERNAL_PREFIX.length);
                const resolution = await this.resolve(moduleId);

                if (!resolution) throw new Error(`Transport not installed: ${moduleId}!`);

                if (resolution.external) return '';

                const entryId = resolution.id;
                return `
                import * as all from ${JSON.stringify(entryId)};
                export * from ${JSON.stringify(entryId)};
                export default all.default ?  all.default : undefined;
                `;
            }

            if (id.startsWith(PINO_EXTERNAL_IMPORTER_PREFIX)) {
                const entryId = id.slice(PINO_EXTERNAL_IMPORTER_PREFIX.length);
                return `
                import * as all from ${JSON.stringify(PINO_EXTERNAL_PROXY_PREFIX + entryId)};
                export * from ${JSON.stringify(PINO_EXTERNAL_PROXY_PREFIX + entryId)};
                export default all.default ?  all.default : undefined;
                `;
            }
        },

        transform(code, id) {
            if (id.startsWith(PINO_EXTERNAL_IMPORTER_PREFIX)) {
                const fileName = id.slice(PINO_EXTERNAL_IMPORTER_PREFIX.length);
                const proxyEntry = PINO_EXTERNAL_PROXY_PREFIX + fileName;

                return code.replaceAll(JSON.stringify(proxyEntry), JSON.stringify(fileName));
            }
        },
        // todo: vite dev  server support
        // // vite caching
        // async closeBundle(error) {
        //     if (error || pinoCache || !isVite) return;

        //     let cache: PinoCache = {};
        //     const cacheFiles = Object.entries(overrides);
        //     cacheFiles.push(['pino', pinoFile]);

        //     await Promise.all(
        //         cacheFiles.map(async ([name, relative]) => {
        //             const filePath = path.join(outDir, relative);
        //             const source = await readFile(filePath, 'utf-8');
        //             const sourceMap = await readFile(`${filePath}.map`, 'utf-8').catch(
        //                 () => undefined
        //             );
        //             cache[filePath] = { source, sourceMap };
        //         })
        //     );

        //     pinoCache = cache;
        // },

        // rollup caching
        async writeBundle(options, bundle) {
            if (pinoCache) return;

            let cache: PinoCache = {};
            const cacheFiles = Object.entries(overrides);
            cacheFiles.push(['pino', pinoFile]);

            await Promise.all(
                cacheFiles.map(async ([name, filePath]) => {
                    const fileName = filePath.replace(/^\.\//, '');
                    const absolutePath = path.join(outDir, filePath);
                    const chunk = bundle[fileName];

                    if (!chunk || chunk.type !== 'chunk')
                        throw new Error(`Chunk not in bundle: ${fileName}`);

                    cache[absolutePath] = {
                        source: chunk.code,
                        sourceMap: chunk.map ? chunk.map.toString() : undefined,
                    };
                })
            );

            pinoCache = cache;
        },
    };

    return plugin;
}

export default RollupPinoPlugin;
