import { getAuthHandlers } from "@/lib/auth-server";

const handlers = getAuthHandlers();

export const GET = handlers.GET;
export const POST = handlers.POST;
