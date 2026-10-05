# Vercel — web client only.
#
# The simulation does NOT deploy here. Next.js earns its place for the
# marketing/docs shell and preview deploys; the world itself is a WebSocket-fed
# island talking to the engine (TECH_STACK §4).
#
# Configure in the Vercel dashboard or `vercel.json`, not in this file — no
# framework preset is needed because Next.js is detected from apps/web.

vercel deploy — web only

Environment variable (project settings):

  NEXT_PUBLIC_API_URL   https://<engine-host>

Note the client-visible consequence of the engine's reconnect design: because
FR-6.4 resumes from a keyframe rather than replaying missed frames, a client
that reconnects after a long gap is correct immediately rather than catching up
visually. If the engine ever moves to multi-instance, resume needs a shared
session store — FR-6.4 is currently a single-instance guarantee (ARCH §12.2).