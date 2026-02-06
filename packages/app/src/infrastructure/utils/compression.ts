/**
 * 压缩/解压工具
 * 使用浏览器原生 CompressionStream API
 */

/**
 * 将 Uint8Array 安全转换为 Base64 字符串
 * 使用分块处理避免 String.fromCharCode 参数数量超限导致栈溢出
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  const chunkSize = 8192;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

/**
 * 压缩字符串为 gzip 格式
 * @param text 待压缩的文本
 * @returns Base64 编码的压缩数据
 */
export async function compressText(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    }
  });
  
  const compressedStream = stream.pipeThrough(
    new CompressionStream('gzip')
  );
  
  const chunks: Uint8Array[] = [];
  const reader = compressedStream.getReader();
  
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  
  // 合并所有 chunks
  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  
  // 安全转为 Base64（分块处理，避免栈溢出）
  return uint8ArrayToBase64(result);
}

/**
 * 解压 gzip 格式数据
 * @param base64Data Base64 编码的压缩数据
 * @returns 解压后的文本
 */
export async function decompressText(base64Data: string): Promise<string> {
  // Base64 解码
  let binaryString: string;
  try {
    binaryString = atob(base64Data);
  } catch {
    throw new Error("Base64 解码失败，数据可能已损坏");
  }
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    }
  });
  
  const decompressedStream = stream.pipeThrough(
    new DecompressionStream('gzip')
  );
  
  const chunks: Uint8Array[] = [];
  const reader = decompressedStream.getReader();
  
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  
  // 合并并解码
  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  
  const decoder = new TextDecoder();
  return decoder.decode(result);
}
