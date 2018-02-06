const {streamFetch, streamFetchJson, readStdin} = require('./util'),  
  clayUtils = require('clayutils'),
  _ = require('lodash'),
  argv = require('yargs').argv,
  h = require('highland'),
  traverse = require('traverse'),
  runningAsScript = !module.parent;

function clayExport(url) {
  let sitePrefix,
    isComponent = clayUtils.isComponent(url),
    isPage = clayUtils.isPage(url);

  if (!_.startsWith(url, 'http://')) {
    url = 'http://' + url;
  }

  if (isComponent) {
    if (!_.endsWith('.json')) {
      url += '.json';
    }
  }
  sitePrefix = getPrefix(url);

  return streamFetchJson(url)
    .flatMap(result => {
      // array of pages
      if (Array.isArray(result)) {
        return h(result)
          .map(stripPrefix)
          .map(uri => sitePrefix + uri)
          .flatMap(clayExport);
      // a page
      } else if (isPage) {
        return h.values(result)
          .filter(Array.isArray)
          .flatten()
          .map(stripPrefix)
          .map(uri => sitePrefix + uri)
          .flatMap(clayExport)
          .append({
            uri: stripPrefix(url),
            data: replacePagePrefixes(result, '')
          });
      // a composed component object
      } else if (isComponent) {
        return h.of({
          uri: stripPrefix(url).replace('.json', ''),
          data: replaceCmptPrefixes(result, '')
        });
      }
    })
}

function replacePagePrefixes(page, replaceTo) {
  page.layout = replaceTo + stripPrefix(page.layout);

  _.each(page, (value, key) => {
    if (Array.isArray(value)) {
      page[key] = value.map(i => replaceTo + stripPrefix(i));
    }
  });
  return page;
}

function replaceCmptPrefixes(cmpt, replaceTo) {
  traverse(cmpt).forEach(function (x) {
    if (x && typeof x === 'object' && x._ref) {
      x._ref = replaceTo + stripPrefix(x._ref);
      this.update(x);
    }
  });
  return cmpt;
}

function clayImport(asset, site) {
  return h.of(asset)
    .map(asset => {
      asset.url = site + asset.uri;
      if (clayUtils.isComponent(asset.uri)) {
        asset.data = replaceCmptPrefixes(asset.data, stripProtocolAndPort(site));
      } else if (clayUtils.isPage(asset.uri)) {
        asset.data = replacePagePrefixes(asset.data, stripProtocolAndPort(site));
      }
      return asset;
    })
    .flatMap(asset => streamFetch(asset.url, {
      method: 'PUT',
      body: JSON.stringify(asset.data),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Token ${argv.key}`
      }
    }))
    .flatMap(res => h(res.json()))
    .map(resBody => ({url: asset.url, status: 'success'}))
}

function stripProtocolAndPort(url) {
  return url
    .replace('http://', '')
    .replace('https://', '')
    .replace(':3001', '');
}

function getPrefix(uri) {
  if (uri.includes('/components')) return uri.split('/components')[0];
  if (uri.includes('/lists')) return uri.split('/lists')[0];
  if (uri.includes('/users')) return uri.split('/users')[0];
  if (uri.includes('/uris')) return uri.split('/uris')[0];
  if (uri.includes('/pages')) return uri.split('/pages')[0];

}

function stripPrefix(uri) {
  return uri.replace(getPrefix(uri), '');
}

const cmd = argv._[0],
  loc = argv._[1];

if (cmd === 'export') {
  clayExport(loc)
    .map(JSON.stringify)
    .tap(h.log)
    .done(process.exit);
} else if (cmd === 'import') {
  readStdin()
    .map(JSON.parse)
    .flatMap(asset => clayImport(asset, loc))
    .map(JSON.stringify)
    .tap(h.log)
    .done(process.exit);
}

module.exports.clayExport = clayExport;
module.exports.clayImport = clayImport;
