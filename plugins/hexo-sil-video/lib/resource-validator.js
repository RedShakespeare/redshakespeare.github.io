'use strict';

function createResourceValidator({ fs, path, videoError }) {
  function validateManifestType(post, key, entry, expectation) {
    const field = expectation.description;
    if (expectation.type && entry.type !== expectation.type) {
      throw videoError(post, `asset manifest MIME type for ${key} is ${entry.type}, expected ${expectation.type}.`);
    }
    if (expectation.types && !expectation.types.has(entry.type)) {
      throw videoError(post, `asset manifest MIME type for ${key} is ${entry.type}, expected ${Array.from(expectation.types).join(' or ')}.`);
    }
    if (expectation.test && !expectation.test(entry.type)) {
      throw videoError(post, `asset manifest MIME type for ${key} is ${entry.type}, expected ${field}.`);
    }
  }

  function validateLocalType(post, expectation) {
    const field = expectation.description;
    if (expectation.localType && expectation.type && expectation.localType !== expectation.type) {
      throw videoError(post, `${field} extension does not match expected MIME type ${expectation.type}.`);
    }
    if (expectation.localType && expectation.types && !expectation.types.has(expectation.localType)) {
      throw videoError(post, `${field} extension does not match an accepted MIME type.`);
    }
    if (expectation.localType && expectation.test && !expectation.test(expectation.localType)) {
      throw videoError(post, `${field} extension does not match the expected type.`);
    }
  }

  function manifestEntry(post, key, capability, expectation) {
    let entry;
    try {
      entry = capability.getObject(key);
    } catch (error) {
      throw videoError(post, error.message.replace(/^Asset manifest error:\s*/, ''));
    }
    if (!entry) throw videoError(post, `asset manifest does not contain ${key}. Refresh or publish the asset manifest after adding the file.`);
    validateManifestType(post, key, entry, expectation);
    return entry;
  }

  async function localFile(post, file, options, expectation) {
    const field = expectation.description;
    validateLocalType(post, expectation);
    const mediaRoot = path.resolve(options.sourceRoot, options.media.sourceDir);
    if (mediaRoot !== options.sourceRoot && !mediaRoot.startsWith(`${options.sourceRoot}${path.sep}`)) {
      throw videoError(post, '`media.source_dir` must resolve below the Hexo source directory.');
    }
    const localPath = path.resolve(mediaRoot, file);
    if (!localPath.startsWith(`${mediaRoot}${path.sep}`)) throw videoError(post, `${field} must resolve below video.media.source_dir.`);
    let stat;
    try {
      stat = await fs.lstat(localPath);
    } catch (error) {
      throw videoError(post, `local ${field} file does not exist: ${file} (${error.code || error.message}).`);
    }
    if (!stat.isFile() || stat.size <= 0) throw videoError(post, `local ${field} path must be a non-empty regular file: ${file}.`);
    return { size: stat.size, type: expectation.localType || '' };
  }

  async function validateLocalEntry(post, file, options, expectation) {
    const key = `${options.media.prefix}/${file}`;
    const capability = options.assetsEnabled ? options.assetCapability : null;
    if (options.assetsEnabled && !capability && typeof options.onMissingAssets === 'function') options.onMissingAssets();
    return capability
      ? manifestEntry(post, key, capability, expectation)
      : localFile(post, file, options, expectation);
  }

  return { validateLocalEntry };
}

module.exports = { createResourceValidator };
