import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import AssignmentForm from '@/pages/assignment/components/AssignmentForm';

describe('AssignmentForm', () => {
  it('renders children when there is no error', () => {
    render(
      <AssignmentForm
        assignmentsError={null}
        isSuccessUpdate={false}
        isErrorUpdate={false}
        updateError={null}
      >
        <div>Child content</div>
      </AssignmentForm>,
    );
    expect(screen.getByText('Child content')).toBeInTheDocument();
    expect(screen.getByText('Staff Rally (rally-staff)')).toBeInTheDocument();
  });

  it('renders error message instead of children when assignmentsError is set', () => {
    render(
      <AssignmentForm
        assignmentsError={new Error('boom')}
        isSuccessUpdate={false}
        isErrorUpdate={false}
        updateError={null}
      >
        <div>Child content</div>
      </AssignmentForm>,
    );
    expect(screen.queryByText('Child content')).not.toBeInTheDocument();
    expect(screen.getByText('Erro ao carregar atribuições')).toBeInTheDocument();
    expect(screen.getByText('boom')).toBeInTheDocument();
  });

  it('shows success message on isSuccessUpdate', () => {
    render(
      <AssignmentForm
        assignmentsError={null}
        isSuccessUpdate={true}
        isErrorUpdate={false}
        updateError={null}
      >
        <div>Child content</div>
      </AssignmentForm>,
    );
    expect(screen.getByText('Atribuição atualizada com sucesso!')).toBeInTheDocument();
  });

  it('shows update error message with fallback text when updateError has no message', () => {
    render(
      <AssignmentForm
        assignmentsError={null}
        isSuccessUpdate={false}
        isErrorUpdate={true}
        updateError={null}
      >
        <div>Child content</div>
      </AssignmentForm>,
    );
    expect(screen.getByText('Erro ao atualizar atribuição')).toBeInTheDocument();
  });

  it('shows specific update error message when provided', () => {
    render(
      <AssignmentForm
        assignmentsError={null}
        isSuccessUpdate={false}
        isErrorUpdate={true}
        updateError={new Error('update failed')}
      >
        <div>Child content</div>
      </AssignmentForm>,
    );
    expect(screen.getByText('update failed')).toBeInTheDocument();
  });
});
