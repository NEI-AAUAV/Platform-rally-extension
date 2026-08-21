import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import {
  TeamMembersErrorBanners,
  TeamsLoadingBanner,
  MembersLoadingBanner,
  NoTeamsBanner,
} from "./TeamMembersStatusBanners";

describe("TeamMembersErrorBanners", () => {
  it("renders nothing when there are no errors", () => {
    const { container } = render(<TeamMembersErrorBanners />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the teams error banner", () => {
    render(<TeamMembersErrorBanners teamsError={new Error("boom")} />);
    expect(screen.getByText("Erro ao carregar equipas:")).toBeInTheDocument();
  });

  it("renders the members error banner", () => {
    render(<TeamMembersErrorBanners membersError={new Error("boom")} />);
    expect(screen.getByText("Erro ao carregar membros:")).toBeInTheDocument();
  });

  it("renders both banners when both errors are present", () => {
    render(
      <TeamMembersErrorBanners teamsError={new Error("a")} membersError={new Error("b")} />,
    );
    expect(screen.getByText("Erro ao carregar equipas:")).toBeInTheDocument();
    expect(screen.getByText("Erro ao carregar membros:")).toBeInTheDocument();
  });
});

describe("TeamsLoadingBanner", () => {
  it("renders nothing when not loading", () => {
    const { container } = render(<TeamsLoadingBanner teamsLoading={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the loading message when loading", () => {
    render(<TeamsLoadingBanner teamsLoading />);
    expect(screen.getByText("A carregar equipas...")).toBeInTheDocument();
  });
});

describe("MembersLoadingBanner", () => {
  it("renders nothing when not loading", () => {
    const { container } = render(<MembersLoadingBanner membersLoading={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the loading message when loading", () => {
    render(<MembersLoadingBanner membersLoading />);
    expect(screen.getByText("A carregar membros da equipa...")).toBeInTheDocument();
  });
});

describe("NoTeamsBanner", () => {
  it("renders nothing while teams are loading", () => {
    const { container } = render(
      <NoTeamsBanner teamsLoading hasTeams={false} description="none" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when there is a teams error", () => {
    const { container } = render(
      <NoTeamsBanner teamsError={new Error("x")} hasTeams={false} description="none" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when teams exist", () => {
    const { container } = render(<NoTeamsBanner hasTeams description="none" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the empty-state message when there are no teams", () => {
    render(<NoTeamsBanner hasTeams={false} description="Sem equipas disponíveis" />);
    expect(screen.getByText("Sem equipas disponíveis")).toBeInTheDocument();
  });
});
