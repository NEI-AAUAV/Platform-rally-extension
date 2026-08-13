import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import EventModeBanner from "@/pages/settings/components/EventModeBanner";

describe("EventModeBanner", () => {
  it("names the format and what it implies", () => {
    render(<EventModeBanner eventType="peddy_paper" />);
    expect(screen.getByText("Peddy-paper")).toBeInTheDocument();
    expect(screen.getByText(/resposta do enigma/i)).toBeInTheDocument();
  });

  it("describes a rally differently", () => {
    render(<EventModeBanner eventType="rally_tascas" />);
    expect(screen.getByText("Rally Tascas")).toBeInTheDocument();
    expect(screen.getByText(/staff em cada paragem/i)).toBeInTheDocument();
  });

  // Settings load asynchronously and the type is a plain string from the API,
  // so an unknown or absent value must render nothing rather than an empty box.
  it("renders nothing without a known event type", () => {
    const { container } = render(<EventModeBanner eventType={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for an unrecognised event type", () => {
    const { container } = render(<EventModeBanner eventType="mystery_format" />);
    expect(container).toBeEmptyDOMElement();
  });
});
