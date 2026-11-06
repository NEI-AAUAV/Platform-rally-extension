import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PartnerStrip from "@/components/branding/PartnerStrip";

const partners = [
  { id: "a", name: "NEEET", src: "https://r2/neeet.png", darkSrc: "" },
  { id: "b", name: "NEMec", src: "https://r2/nemec.png", darkSrc: "" },
];

const base = {
  showPartners: true,
  aauavLogoSrc: "https://r2/aauav.png",
  aauavLogoDarkSrc: "",
  partners,
};

describe("PartnerStrip", () => {
  it("renders nothing when hidden", () => {
    const { container } = render(<PartnerStrip branding={{ ...base, showPartners: false }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when enabled but empty", () => {
    const { container } = render(
      <PartnerStrip branding={{ ...base, aauavLogoSrc: "", partners: [] }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("puts the AAUAv symbol first, then partners in order", () => {
    render(<PartnerStrip branding={base} />);
    const alts = screen.getAllByRole("img").map((img) => img.getAttribute("alt"));
    expect(alts).toEqual(["AAUAv", "NEEET", "NEMec"]);
  });

  it("renders partners without an AAUAv symbol", () => {
    render(<PartnerStrip branding={{ ...base, aauavLogoSrc: "" }} />);
    expect(screen.queryByAltText("AAUAv")).toBeNull();
    expect(screen.getAllByRole("img")).toHaveLength(2);
  });

  it("uses the coloured logo in light mode and the white one in dark mode", () => {
    render(
      <PartnerStrip
        branding={{
          ...base,
          aauavLogoSrc: "",
          partners: [
            { id: "a", name: "NEI", src: "https://r2/c.png", darkSrc: "https://r2/w.png" },
          ],
        }}
      />,
    );
    const [light, dark] = screen.getAllByAltText("NEI");
    expect(light).toHaveAttribute("src", "https://r2/c.png");
    expect(light).toHaveClass("dark:hidden");
    expect(dark).toHaveAttribute("src", "https://r2/w.png");
    expect(dark).toHaveClass("hidden", "dark:block");
  });

  it("falls back to a light tile in dark mode without a white version", () => {
    render(<PartnerStrip branding={{ ...base, aauavLogoSrc: "" }} />);
    const logo = screen.getByAltText("NEEET");
    expect(logo).toHaveClass("dark:bg-white/90");
    expect(logo).not.toHaveClass("grayscale");
  });
});
