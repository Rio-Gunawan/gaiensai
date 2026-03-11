export async function getLocalIP(): Promise<string | null> {
  let cmd;

  if (Deno.build.os === 'windows') {
    cmd = new Deno.Command('ipconfig');
  } else if (Deno.build.os === 'darwin') {
    cmd = new Deno.Command('ipconfig', { args: ['getifaddr', 'en0'] });
  } else {
    cmd = new Deno.Command('hostname', { args: ['-I'] });
  }

  const { stdout } = await cmd.output();
  const text = new TextDecoder().decode(stdout);

  const match = text.match(
    /(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)/,
  );

  return match ? match[0] : null;
}
