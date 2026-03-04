function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function coerceCoordinateValue(value) {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value !== 'string') {
    return value;
  }

  const parsed = Number(value);
  return Number.isNaN(parsed) ? value : parsed;
}

function setByPath(target, path, value) {
  const segments = path.split('.');
  let cursor = target;

  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i];
    const isLast = i === segments.length - 1;
    const isIndex = /^\d+$/.test(segment);
    const nextSegment = segments[i + 1];
    const nextIsIndex = /^\d+$/.test(nextSegment);

    if (isLast) {
      if (isIndex && Array.isArray(cursor)) {
        cursor[Number(segment)] = value;
      } else {
        cursor[segment] = value;
      }
      return;
    }

    if (isIndex) {
      const idx = Number(segment);
      if (!Array.isArray(cursor)) {
        return;
      }
      if (!cursor[idx]) {
        cursor[idx] = nextIsIndex ? [] : {};
      }
      cursor = cursor[idx];
      continue;
    }

    if (!cursor[segment]) {
      cursor[segment] = nextIsIndex ? [] : {};
    }
    cursor = cursor[segment];
  }
}

function parseAddressJsonString(rawAddress) {
  if (typeof rawAddress !== 'string') {
    return { ok: true, value: rawAddress };
  }

  const trimmed = rawAddress.trim();
  if (!trimmed) {
    return { ok: true, value: rawAddress };
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (!isPlainObject(parsed)) {
      return { ok: false, error: 'Address must be a valid JSON object.' };
    }
    return { ok: true, value: parsed };
  } catch (error) {
    return { ok: false, error: 'Invalid address JSON payload.' };
  }
}

function normalizeAddressPayload(req, res, next) {
  if (!req.body || typeof req.body !== 'object') {
    return next();
  }

  const parsedAddress = parseAddressJsonString(req.body.address);
  if (!parsedAddress.ok) {
    return res.status(400).json({ errors: [{ msg: parsedAddress.error }] });
  }

  if (parsedAddress.value !== undefined) {
    req.body.address = parsedAddress.value;
  }

  const dottedAddressKeys = Object.keys(req.body).filter((key) => key.startsWith('address.'));
  if (!dottedAddressKeys.length) {
    return next();
  }

  if (!isPlainObject(req.body.address)) {
    req.body.address = {};
  }

  dottedAddressKeys.forEach((key) => {
    const nestedPath = key.slice('address.'.length);
    let value = req.body[key];

    if (nestedPath === 'location.coordinates' && typeof value === 'string') {
      try {
        const parsedCoordinates = JSON.parse(value);
        if (Array.isArray(parsedCoordinates)) {
          value = parsedCoordinates.map(coerceCoordinateValue);
        }
      } catch (error) {
        value = value.split(',').map((item) => coerceCoordinateValue(item.trim()));
      }
    }

    if (nestedPath.startsWith('location.coordinates')) {
      if (Array.isArray(value)) {
        value = value.map(coerceCoordinateValue);
      } else {
        value = coerceCoordinateValue(value);
      }
    }

    setByPath(req.body.address, nestedPath, value);
    delete req.body[key];
  });

  return next();
}

module.exports = {
  normalizeAddressPayload
};
