import { logoutAction } from "@/app/actions/auth";
import { navLinkClass } from "@/lib/styles";

export function LogoutButton() {
  return (
    // display:contents (no un <form> normal): un <form> es un elemento de
    // bloque — como hijo directo de un contenedor flex (nav del header)
    // metía su propia caja en el eje cruzado y desalineaba verticalmente
    // el botón contra el <Link> "Tu perfil" de al lado (bug real, pedido
    // explícito). Con "contents", el <button> pasa a ser el item flex
    // directo, igual que cualquier <Link> hermano.
    <form action={logoutAction} className="contents">
      <button type="submit" className={navLinkClass}>
        Cerrar sesión
      </button>
    </form>
  );
}
