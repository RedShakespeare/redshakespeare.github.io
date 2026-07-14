'use strict';

const { registerAssetsPlugin } = require('../plugins/hexo-sil-assets');

if (typeof hexo !== 'undefined') registerAssetsPlugin(hexo);

module.exports = { registerAssetsPlugin };
