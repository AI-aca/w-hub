// as: supabase/functions/api/areas/x/actions.ts
import { db } from "../../lib/db.ts";
export const list = () => db((tx) => tx.unsafe("select * from people.students where name = '" + n + "'"));
