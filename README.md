# Rollup/Vite Pino Plugin Documentation

## Overview

This plugin provides seamless bundling of Pino logger and its transports for Rollup and Vite projects. It handles the special requirements of Pino's worker threads and file transports, making them work properly in bundled applications.

## Installation

```bash
npm install -D rollup-plugin-pino-bundle
```

## Usage

### Basic Configuration (Rollup)

```javascript
import { rollup } from 'rollup';
import pinoBundle from 'rollup-plugin-pino-bundle';

const bundle = await rollup({
    input: 'src/main.js',
    plugins: [
        pinoBundle({
            transports: ['pino-pretty'], // optional transports to include
            pinoDir: 'custom-pino', // optional custom directory
        }),
    ],
});
```

### Basic Configuration (Vite)

```javascript
import { defineConfig } from 'vite';
import pinoBundle from 'rollup-plugin-pino-bundle';

export default defineConfig({
    plugins: [
        pinoBundle({
            transports: ['pino-pretty'], // optional transports to include
            transportsDir: 'custom-transports', // optional custom transports directory
        }),
    ],
});
```

## Options

### `transports`

Type: `string[]`  
Default: `[]`

An array of pino transport module names to bundle with your application.

Example:

```javascript
pinoBundle({
    transports: ['pino-pretty', 'pino-loki'],
});
```

### `pinoDir`

Type: `string`  
Default: `'pino'`

Set custom directory for pino files. This is the root directory where all pino-related files will be placed.

Example:

```javascript
pinoBundle({
    pinoDir: 'custom-pino',
});
```

### `transportsDir`

Type: `string`  
Default: `${pinoDir}/transports`

Set custom directory for all transports. By default, it will be a subdirectory of the `pinoDir`.

Example:

```javascript
pinoBundle({
    transportsDir: 'my-transports', // will be relative to output directory
});
```

## File Structure

The plugin creates the following directory structure in your output folder:

```
/pino
  /pino.js                # Main pino bundle
  /transports
    /pino-file.js         # File transport worker
    /pino-worker.js       # Worker implementation
    /thread-stream-worker.js # Thread stream worker
    /[transport-name].js   # Any additional transports you specify
```

## Caching

The plugin implements caching to improve build performance

## TypeScript Support

The package includes TypeScript type definitions out of the box.

## Limitations

1. Currently has limited Vite dev server support (planned for future versions)

## Troubleshooting

**Problem**: Transports not working in production build  
**Solution**: Make sure to include all required transports in the `transports` option

## Contributing

Contributions are welcome! Please open issues or pull requests on GitHub.

## License

MIT
