declare module "obj2gltf" {
  const obj2gltf: (path: string, options?: Record<string, unknown>) => Promise<Buffer>;
  export default obj2gltf;
}
