/* ============================================================
   CLIENTES DO PRUMO
   Cada empresa é uma organização, e o banco só entrega a cada uma o
   que é dela. A Fama é a primeira cliente e tem recursos próprios
   (o painel Gerencial Yacht, por exemplo) que não existem para as
   demais. Os recursos específicos dela se ligam por aqui.
   ============================================================ */

export const ORG_FAMA = 'a4e1cad5-cb9a-0f87-363b-46873b061274'

export const ehFama = (organizationId) => organizationId === ORG_FAMA
