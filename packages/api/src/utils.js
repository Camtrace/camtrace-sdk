export default {
  requireAll(requireContext) {
    return requireContext.keys().map(requireContext)
  },
  b64ToBlob(b64Data, contentType='', sliceSize=512) {
    const byteCharacters = atob(b64Data)
    const byteArrays = []
    
    for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
      const slice = byteCharacters.slice(offset, offset + sliceSize)
      
      const byteNumbers = new Array(slice.length)
      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i)
      }

      byteArrays.push(new Uint8Array(byteNumbers))
    }

    return new Blob(byteArrays, {type: contentType})
  },
  toBlob(byteCharacters, contentType='image/jpeg') {
    return new Blob(new Uint8Array(byteCharacters), {type: contentType})
  },
  dateDiff(date) {
    if (date != null) {
      let time = Date.parse(date);
      if (!Number.isNaN(time)) {
        return Date.now() - time;
      }
    }
    return 0;
  }
}