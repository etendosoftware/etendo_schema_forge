// AD_Image.Name (Etendo/Openbravo core column) is capped at 60 characters.
// `NeoImageHelper.handlePostImage` (com.etendoerp.go) calls Image.setName(name)
// with whatever `name` the client sends and throws a 500 ValidationException
// ("Value too long. Length N, maximum allowed 60") if it's longer — a real
// screenshot filename like
// "Captura_de_pantalla_2026-07-28_a_las_10.02.31_a._m._2_optimized_2000.png"
// (72 chars) reproduces this on ANY image upload, not just one window (ETP-4749
// review round — found via the Organización logo upload, but ImageField in
// contract-ui has the identical bug since it also sends `file.name` verbatim).
//
// Truncating client-side is the correct place to fix this: the 60-char limit is
// an Openbravo core AD_Image constraint, not something the frontend can widen,
// and every NEO image-upload caller shares this same POST body shape.
const AD_IMAGE_NAME_MAX_LENGTH = 60;

/**
 * Truncate a filename to fit AD_Image.Name (60 chars), preserving the file
 * extension when possible so the truncated name still reads as the same type.
 */
export function sanitizeImageName(fileName, maxLength = AD_IMAGE_NAME_MAX_LENGTH) {
  if (!fileName || fileName.length <= maxLength) return fileName;
  const dotIndex = fileName.lastIndexOf('.');
  const hasExtension = dotIndex > 0 && dotIndex < fileName.length - 1;
  const ext = hasExtension ? fileName.slice(dotIndex) : '';
  const base = hasExtension ? fileName.slice(0, dotIndex) : fileName;
  const keep = Math.max(1, maxLength - ext.length);
  return base.slice(0, keep) + ext;
}
