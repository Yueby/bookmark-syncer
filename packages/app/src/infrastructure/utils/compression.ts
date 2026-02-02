/**
 * 压缩/解压工具
 * 使用浏览器原生 CompressionStream API
 */

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
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  
  // 合并所有 chunks
  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  
  // 转为 Base64
  return btoa(String.fromCharCode(...result));
}

/**
 * 解压 gzip 格式数据
 * @param base64Data Base64 编码的压缩数据
 * @returns 解压后的文本
 */
export async function decompressText(base64Data: string): Promise<string> {
  // Base64 解码
  const binaryString = atob(base64Data);
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
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
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
