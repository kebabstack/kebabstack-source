// Deterministic PDF generated and archived by the canister, never uploaded by a buyer.
// All document syntax is ASCII; WinAnsi text is escaped as hex, including brackets.
import Text "mo:core/Text";
import Char "mo:core/Char";
import Nat "mo:core/Nat";
import Nat32 "mo:core/Nat32";
import Int "mo:core/Int";
import List "mo:core/List";
import Iter "mo:core/Iter";
import Qr "Qr";
import Widths "FontWidths";

module {
  public type Buyer = { pid : Text; name : Text; email : Text; street : Text; houseNo : Text; postalCode : Text; town : Text; country : Text };
  public type Data = {
    kind : Text; number : Text; issuedOn : Text; dueOn : Text; reference : Text; referencePretty : Text;
    seller : { name : Text; street : Text; houseNo : Text; postalCode : Text; town : Text; country : Text; uid : Text; vatRegistered : Bool };
    ibanPretty : Text; buyer : Buyer; description : Text;
    netMinor : Nat; vatRateBp : Nat; vatMinor : Nat; grossMinor : Nat; currency : Text;
    net : Text; vat : Text; gross : Text; vatRate : Text; qrPayload : Text; lang : Text; footer : Text;
    waiverText : Text; waiverVersion : Nat; acceptedLine : Text; creditOf : Text;
  };
  func num(n : Int) : Text = n.toText();
  func ansi(c : Char) : ?Nat {
    let cp = c.toNat32().toNat();
    if ((cp >= 32 and cp <= 126) or (cp >= 160 and cp <= 255)) return ?cp;
    switch cp { case (0x2014) ?151; case (0x2013) ?150; case (0x2018) ?145; case (0x2019) ?146; case (0x201c) ?147; case (0x201d) ?148; case (0x20ac) ?128; case (0x2026) ?133; case (0x2022) ?149; case (0x0152) ?140; case (0x0153) ?156; case (0x0160) ?138; case (0x0161) ?154; case (0x017d) ?142; case (0x017e) ?158; case (0x0178) ?159; case _ null };
  };
  func printable(s : Text) : Bool { for (c in s.chars()) if (c != '\n' and ansi(c) == null) return false; true };
  func width(s : Text, bold : Bool) : Nat { var n = 0; for (c in s.chars()) n += (if (bold) Widths.bold else Widths.regular)[ansi(c) ?? 63]; n };
  func hexText(s : Text) : Text {
    let digits = "0123456789ABCDEF".toArray(); let out = List.empty<Text>();
    for (c in s.chars()) { let b = ansi(c) ?? 63; out.add(Char.toText(digits[b / 16]) # Char.toText(digits[b % 16])) };
    Text.join(out.values(), "");
  };
  // Width is expressed in half-em units; wrap by actual glyph advances, not character count.
  func wrap(s : Text, limit : Nat) : [Text] {
    let lines = List.empty<Text>();
    for (paragraph in s.split(#char '\n')) {
      var line = "";
      for (word in paragraph.split(#char ' ')) {
        if (word != "") {
          if (line != "" and width(line # " " # word, false) > limit * 500) { lines.add(line); line := "" };
          if (line != "") line #= " ";
          for (c in word.chars()) { if (width(line # c.toText(), false) > limit * 500) { lines.add(line); line := "" }; line #= c.toText() };
        };
      };
      lines.add(line);
    };
    lines.toArray();
  };
  func dec(milli : Nat) : Text { let f = milli % 1000; (milli / 1000).toText() # "." # (if (f < 100) "0" else "") # (if (f < 10) "0" else "") # f.toText() };
  public func render(d : Data, device : Text, serial : Text) : ?Blob {
    for (value in [d.number, d.seller.name, d.seller.street, d.seller.houseNo, d.seller.postalCode, d.seller.town, d.seller.uid, d.buyer.name, d.buyer.street, d.buyer.houseNo, d.buyer.postalCode, d.buyer.town, d.buyer.email, d.description, d.footer, d.waiverText, d.acceptedLine, device, serial].values()) if (not printable(value)) return null;
    var layoutFits = true;
    func fit(s : Text, max : Nat, preferred : Nat, bold : Bool) : Nat { var size = preferred; while (size > 8 and width(s, bold) * size > max * 1000) size -= 1; if (width(s, bold) * size > max * 1000) layoutFits := false; size };
    let pages = List.empty<Text>(); var commands = List.empty<Text>();
    func raw(s : Text) { commands.add(s # "\n") };
    func t(s : Text, x : Int, y : Int, size : Nat, bold : Bool) { raw("BT /" # (if (bold) "F2" else "F1") # " " # size.toText() # " Tf 1 0 0 1 " # num(x) # " " # num(y) # " Tm <" # hexText(s) # "> Tj ET") };
    func line(x : Int, y : Int, x2 : Int, y2 : Int) { raw(num(x) # " " # num(y) # " m " # num(x2) # " " # num(y2) # " l S") };
    func paragraph(s : Text, x : Int, start : Int, width : Nat, size : Nat) : Int { var y = start; for (l in wrap(s, width).values()) { t(l, x, y, size, false); y -= size + 4 }; y };
    func finish() { pages.add(Text.join(commands.values(), "")); commands := List.empty<Text>() };
    func header(caption : Text) { raw("0.12 0.16 0.2 rg 0.4 w"); t(d.seller.name, 48, 791, fit(d.seller.name, 315, 13, true), true); t(caption, 385, 791, 18, true); t(d.number, 385, 768, 11, false); line(48, 740, 547, 740) };
    header(if (d.kind == "creditNote") "Credit note" else "Invoice");
    t(d.seller.street # " " # d.seller.houseNo # " · " # d.seller.postalCode # " " # d.seller.town, 48, 773, fit(d.seller.street # " " # d.seller.houseNo # " · " # d.seller.postalCode # " " # d.seller.town, 320, 9, false), false);
    t(d.seller.uid # (if (d.seller.vatRegistered) " MWST" else ""), 48, 757, 9, false);
    t("BILL TO", 48, 711, 9, true);
    let buyerEnd = paragraph(d.buyer.name # "\n" # d.buyer.street # " " # d.buyer.houseNo # "\n" # d.buyer.postalCode # " " # d.buyer.town # " · " # d.buyer.country # "\n" # d.buyer.email, 48, 693, 52, 10);
    if (buyerEnd < 609) layoutFits := false;
    t("Issued: " # d.issuedOn, 385, 709, 10, false); t("Due: " # d.dueOn, 385, 691, 10, false);
    t(d.currency # " " # d.gross, 385, 656, 21, true);
    raw("0.94 0.95 0.96 rg 48 578 499 24 re f 0.12 0.16 0.2 rg");
    t("USED EQUIPMENT · QTY 1", 56, 587, 9, true);
    let end = paragraph(d.description, 56, 562, 76, 10);
    line(48, end - 3, 547, end - 3);
    t("Net", 330, end - 24, 10, false); t(d.currency # " " # d.net, 438, end - 24, 10, false);
    t("VAT " # d.vatRate # "%", 330, end - 41, 10, false); t(d.currency # " " # d.vat, 438, end - 41, 10, false);
    t("Total", 330, end - 62, 12, true); t(d.currency # " " # d.gross, 438, end - 62, 12, true);
    ignore paragraph("Reference: " # d.referencePretty # "\nPlease pay by " # d.dueOn # ". Payment is confirmed separately by the seller.", 48, 383, 87, 9);
    if (d.qrPayload != "") {
      let qr = Qr.encode(d.qrPayload) ?? (return null);
      let de = d.lang == "de"; let fr = d.lang == "fr"; let it = d.lang == "it";
      let account = if (de) "Konto / Zahlbar an" else if (fr) "Compte / Payable à" else if (it) "Conto / Pagabile a" else "Account / Payable to";
      let reference = if (de) "Referenz" else if (fr) "Référence" else if (it) "Riferimento" else "Reference";
      let payable = if (de) "Zahlbar durch" else if (fr) "Payable par" else if (it) "Pagabile da" else "Payable by";
      raw("0 0 0 rg [3 3] 0 d"); line(0, 298, 595, 298); line(176, 0, 176, 298); raw("[] 0 d");
      t(if (de) "Empfangsschein" else if (fr) "Récépissé" else if (it) "Ricevuta" else "Receipt", 14, 274, 11, true);
      t(if (de) "Zahlteil" else if (fr) "Section paiement" else if (it) "Sezione pagamento" else "Payment part", 190, 274, 11, true);
      let seller = d.ibanPretty # "\n" # d.seller.name # "\n" # d.seller.street # " " # d.seller.houseNo # "\n" # d.seller.country # "-" # d.seller.postalCode # " " # d.seller.town;
      let buyer = d.buyer.name # "\n" # d.buyer.street # " " # d.buyer.houseNo # "\n" # d.buyer.country # "-" # d.buyer.postalCode # " " # d.buyer.town;
      t(account, 14, 253, 6, true); var ry = paragraph(seller, 14, 243, 38, 7);
      t(reference, 14, ry - 3, 6, true); ry := paragraph(d.referencePretty, 14, ry - 13, 34, 7);
      t(payable, 14, ry - 3, 6, true); let receiptEnd = paragraph(buyer, 14, ry - 13, 38, 7); if (receiptEnd < 98) layoutFits := false;
      t(account, 335, 253, 8, true); var iy = paragraph(seller, 335, 239, 53, 9);
      t(reference, 335, iy - 4, 8, true); iy := paragraph(d.referencePretty, 335, iy - 18, 43, 9);
      let fields = d.qrPayload.split(#char '\n').toArray();
      if (fields.size() > 29 and fields[29] != "") {
        t(if (de) "Zusätzliche Informationen" else if (fr) "Informations supplémentaires" else if (it) "Informazioni supplementari" else "Additional information", 335, iy - 4, 8, true);
        iy := paragraph(fields[29], 335, iy - 18, 59, 8);
      };
      t(payable, 335, iy - 4, 8, true); let paymentEnd = paragraph(buyer, 335, iy - 18, 53, 9); if (paymentEnd < 28) layoutFits := false;
      let currency = if (de) "Währung" else if (fr) "Monnaie" else if (it) "Valuta" else "Currency";
      let amount = if (de) "Betrag" else if (fr) "Montant" else if (it) "Importo" else "Amount";
      t(currency, 14, 85, 6, true); t(amount, 76, 85, 6, true); t(d.currency, 14, 72, 8, false); t(d.gross, 76, 72, 8, false);
      t(currency, 190, 99, 8, true); t(amount, 252, 99, 8, true); t(d.currency, 190, 84, 10, false); t(d.gross, 252, 84, 10, false);
      t(if (de) "Annahmestelle" else if (fr) "Point de dépôt" else if (it) "Punto di accettazione" else "Acceptance point", 85, 43, 6, true);
      // 46 mm code, white quiet zone surrounding it; row runs keep the PDF compact.
      let n = qr.size(); let scale = dec(130394 / n);
      raw("q " # scale # " 0 0 " # scale # " 190 119 cm");
      var r = 0; while (r < n) { var c = 0; while (c < n) { if (qr[r][c]) { let start = c; while (c < n and qr[r][c]) c += 1; raw(start.toText() # " " # (n - r - 1).toText() # " " # (c - start).toText() # " 1 re f") } else c += 1 }; r += 1 };
      raw("Q 1 1 1 rg 245.3 174.3 19.84 19.84 re f 0 0 0 rg 247 176 16.44 16.44 re f 1 1 1 rg 253.56 178.69 3.32 11.06 re f 249.69 182.56 11.06 3.32 re f 0 0 0 rg");
    };
    finish();
    header("Hand-over terms");
    var y : Int = 712;
    y := paragraph(device # " · " # serial # "\nBuyer: " # d.buyer.name # "\n" # d.currency # " " # d.gross # " · terms version " # d.waiverVersion.toText(), 48, y, 90, 10) - 16;
    let all = d.waiverText # "\n\nACCEPTANCE\n" # d.acceptedLine # "\n\n" # d.footer;
    for (l in wrap(all, 88).values()) {
      if (y < 60) { t("Continued on next page", 48, 32, 8, false); finish(); header("Terms continued"); y := 712 };
      t(l, 48, y, 10, false); y -= 15;
    };
    finish();
    let objects = List.empty<Text>();
    objects.add("<< /Type /Catalog /Pages 2 0 R >>");
    var kids = ""; var p = 0; while (p < pages.size()) { kids #= (5 + p * 2).toText() # " 0 R "; p += 1 };
    objects.add("<< /Type /Pages /Count " # pages.size().toText() # " /Kids [" # kids # "] >>");
    objects.add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    objects.add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    p := 0; for (content in pages.values()) {
      objects.add("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.276 841.89] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents " # (6 + p * 2).toText() # " 0 R >>");
      objects.add("<< /Length " # content.size().toText() # " >>\nstream\n" # content # "endstream"); p += 1;
    };
    let parts = List.empty<Text>(); parts.add("%PDF-1.4\n"); var offset = 9; let offsets = List.empty<Nat>(); var id = 1;
    for (obj in objects.values()) { offsets.add(offset); let chunk = id.toText() # " 0 obj\n" # obj # "\nendobj\n"; parts.add(chunk); offset += chunk.size(); id += 1 };
    let xref = offset; parts.add("xref\n0 " # id.toText() # "\n0000000000 65535 f \n");
    for (pos in offsets.values()) { var s = pos.toText(); while (s.size() < 10) s := "0" # s; parts.add(s # " 00000 n \n") };
    parts.add("trailer\n<< /Size " # id.toText() # " /Root 1 0 R >>\nstartxref\n" # xref.toText() # "\n%%EOF\n");
    if (not layoutFits) return null;
    ?Text.encodeUtf8(Text.join(parts.values(), ""));
  };
};
